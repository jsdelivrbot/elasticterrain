// ELASTIC TERRAIN MAP

// Copyright (C) 2015 Jonas Buddeberg <buddebej * mailbox.org>, 
//                    Bernhard Jenny <jennyb * geo.oregonstate.edu>

// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.

// You should have received a copy of the GNU General Public License
// along with this program.  If not, see <http://www.gnu.org/licenses/>.

goog.provide('ol.interaction.DragShearIntegrated');

goog.require('goog.asserts');
goog.require('goog.async.AnimationDelay');
goog.require('ol.Pixel');
goog.require('ol.coordinate');
goog.require('ol.events.condition');
goog.require('ol.interaction.Pointer');
goog.require('ol.ViewHint');
goog.require('ol.Elevation');

/** @typedef {{map:ol.Map,
 threshold:number,
 springCoefficient:number,
 frictionForce:number,
 maxInnerShearingPx: number,
 maxOuterShearingPx: number,
 staticShearFadeOutAnimationSpeed: number,
 hybridDampingDuration: number }} */
ol.interaction.DragShearIntegratedOptions;


/**
 * @classdesc
 * Terrain Interaction DragShearIntegrated
 *
 * @constructor
 * @extends {ol.interaction.Pointer}
 * @param {ol.interaction.DragShearIntegratedOptions} options
 * @param {ol.Map} map
 * @param {ol.events.ConditionType} condition
 * @api stable
 */
ol.interaction.DragShearIntegrated = function(options, map, condition) {
    goog.base(this, {
        handleDownEvent: ol.interaction.DragShearIntegrated.handleDownEvent_,
        handleDragEvent: ol.interaction.DragShearIntegrated.handleDragEvent_,
        handleUpEvent: ol.interaction.DragShearIntegrated.handleUpEvent_
    });

    /**
     * Shearing Interaction State
     * @enum {number}
     */
    ol.interaction.State = {
        NO_SHEARING: 0,
        STATIC_SHEARING: 1,
        HYBRID_SHEARING: 2,
        ANIMATION_AFTER_STATIC_SHEARING: 3
    };

    /** @type {ol.interaction.DragShearIntegratedOptions} */
    this.options;
    this.setOptions(options);

    goog.asserts.assertInstanceof(map, ol.Map, 'dragShearIntegrated expects map object');

    /** @type {ol.Map} */
    this.map = map;

    /** @type {ol.View} */
    this.view = this.map.getView();

    // find elevation model layer
    var demIndex = null;
    goog.array.forEach(this.map.getLayers().getArray(), function(v, i, array) {
        if ( /** @type {ol.source.TileImage} */ ( /** @type {ol.layer.TileDem|ol.layer.Tile} */ (v).getSource()).isDemTileImage) {
            demIndex = i;
        }
    });
    /** @type {ol.layer.TileDem} */
    this.demLayer = /** @type {ol.layer.TileDem} */ (this.map.getLayers().getArray()[demIndex]);

    /** @type {ol.renderer.webgl.TileDemLayer} */
    this.demRenderer = /** @type {ol.renderer.webgl.TileDemLayer} */ (this.map.getRenderer().getLayerRenderer(this.demLayer));

    /** @type {ol.events.ConditionType} */
    this.condition = goog.isDef(condition['keypress']) ? condition['keypress'] : ol.events.condition.noModifierKeys;

    /** @type {null|ol.control.MousePositionDem} */
    this.elevationIndicator = /** @type {ol.control.MousePositionDem} */ (this.map.getControls().getArray()[3]);

    // FIXME: The above expression should be better solved like this: (However, InstanceOf does not work correct)
    // this.elevationIndicator = /** @type {ol.control.MousePositionDem} */ (goog.array.find(this.map.getControls().getArray(),
    //     function(element, index, array) {
    //         console.log(element);
    //         return (goog.asserts.assertInstanceof(element, ol.control.MousePositionDem));
    //     }, this));

    /** @type {number} */
    this.springLength = 0;

    /** @type {ol.Pixel} */
    this.startDragPositionPx = [0, 0];

    /** @type {number|null} */
    this.startDragElevation = 0;

    /** @type {number} */
    this.minElevation = ol.Elevation.MIN;

    /** @type {number} */
    this.maxElevation = ol.Elevation.MAX;

    /** @type {number} */
    this.minElevationLocal = ol.Elevation.MIN;

    /** @type {number} */
    this.maxElevationLocal = ol.Elevation.MAX;

    /** @type {ol.Pixel} */
    this.startCenter = [0, 0];

    /** @type {ol.Pixel} */
    this.currentCenter = [0, 0];

    /** @type {number}
     * Horizontal speed of the terrain animation [meters per second]
     */
    this.vx_t_1 = 0;

    /** @type {number}
     * Vertical speed of the terrain animation [meters per second]
     */
    this.vy_t_1 = 0;

    /** @type {ol.Pixel} */
    this.currentDragPositionPx = [0, 0];

    /** @type {Date}
     * Time when last rendering occured. Used to measure FPS and adjust shearing speed accordingly. */
    this.lastRenderTime = null;

    /** @type {Date}
     * Time when animation started. Used for debugging and logging. */
    this.timeSinceAnimationBegin = null;

    /** @type {number}
     * Average FPS value */
    this.fpsMean = 0;

    /** @type {number}
     * Counter for active animation */
    this.animationFrameCounter = 0;

    /** @type {number}
     * Time when static shearing changed to hybrid shearing in milliseconds. */
    this.hybridShearingStartTimeMS = -1;

    /** @type {number}
     * Distance between current mouse position and point being animated [meters].*/
    this.distanceX = 0;

    /** @type {number}
     * Distance between current mouse position and point being animated [meters] */
    this.distanceY = 0;

    /** @type {number} */
    this.shearingStatus = ol.interaction.State.NO_SHEARING;

    /** @type {?olx.FrameState} */
    this.frameState;

    /**
     * @private
     * @type {goog.async.AnimationDelay}
     */
    this.animationDelay = new goog.async.AnimationDelay(this.animation, undefined, this);
    this.registerDisposable(this.animationDelay);
};

goog.inherits(ol.interaction.DragShearIntegrated, ol.interaction.Pointer);

/**
 * @param {ol.MapBrowserPointerEvent} mapBrowserEvent Event.
 * @this {ol.interaction.DragShearIntegrated}
 */

ol.interaction.DragShearIntegrated.handleDragEvent_ = function(mapBrowserEvent) {

    if (this.targetPointers.length > 0 && this.condition(mapBrowserEvent)) {
        goog.asserts.assert(this.targetPointers.length >= 1);

        this.frameState = mapBrowserEvent.frameState;

        this.currentDragPositionPx = ol.interaction.Pointer.centroid(this.targetPointers);

        if (this.shearingStatus === ol.interaction.State.STATIC_SHEARING) {
            // position of drag start in meters
            var currentDragPosition = this.map.getCoordinateFromPixel(this.currentDragPositionPx),
                startDragPosition = this.map.getCoordinateFromPixel(this.startDragPositionPx),
                // position of point that is animated
                animatingPositionX = startDragPosition[0] - (this.currentCenter[0] - this.startCenter[0]),
                animatingPositionY = startDragPosition[1] - (this.currentCenter[1] - this.startCenter[1]),
                // distance between current mouse position and point being animated
                distanceX = currentDragPosition[0] - animatingPositionX,
                distanceY = currentDragPosition[1] - animatingPositionY,
                distance = Math.sqrt(distanceX * distanceX + distanceY * distanceY),
                maxOuterShearingMeters = this.options['maxOuterShearingPx'] * this.view.getResolution();

            // set spring length equal to drag distance
            this.springLength = Math.min(maxOuterShearingMeters, distance);

            // switch from static shearing to hybrid shearing if the pointer is leaving the outer circle.
            if (distance >= maxOuterShearingMeters) {
                this.hybridShearingStartTimeMS = new Date().getTime();
                this.shearingStatus = ol.interaction.State.HYBRID_SHEARING;
            }
        }
        this.animationDelay.start();
        // console.log(this.minElevation, this.maxElevation, this.minElevationLocal, this.maxElevationLocal);
    }
};

/**
 * @param {ol.MapBrowserPointerEvent} mapBrowserEvent Event.
 * @return {boolean} Stop drag sequence?
 * @this {ol.interaction.DragShearIntegrated}
 * @private
 */
ol.interaction.DragShearIntegrated.handleUpEvent_ = function(mapBrowserEvent) {
    if (this.targetPointers.length === 0) {
        if (this.shearingStatus === ol.interaction.State.STATIC_SHEARING) {
            this.shearingStatus = ol.interaction.State.ANIMATION_AFTER_STATIC_SHEARING;
            this.springLength = 0;
        }
        // unlock minMax
        this.demRenderer.setFreezeMinMax(false);

        // unfreeze values for elevation and coordinate indicator after dragging
        if (!goog.isNull(this.elevationIndicator)) {
            this.elevationIndicator.setFreeze(false);
        }

        return true;
    }
    return false;
};

/**
 * @param {ol.MapBrowserPointerEvent} mapBrowserEvent Event.
 * @return {boolean} Start drag sequence?
 * @this {ol.interaction.DragShearIntegrated}
 * @private
 */
ol.interaction.DragShearIntegrated.handleDownEvent_ = function(mapBrowserEvent) {
    // console.log("inner circle radius", this.options['maxInnerShearingPx']);
    // console.log("outer circle radius", this.options['maxOuterShearingPx']);
    // console.log("wiggling threshold", this.options['threshold']);
    // console.log("spring constant", this.options['springCoefficient']);
    // console.log("velocity friction coefficient", this.options['frictionForce']);

    var minMax, minMaxLocal,
        mapCenter;

    if (this.targetPointers.length > 0 && this.condition(mapBrowserEvent)) {

        // get global max and min for visible extent
        minMax = this.demRenderer.getStaticMinMax();
        this.minElevation = minMax[0];
        this.maxElevation = minMax[1];

        // lock minMax to make sure the shader uses the same minMax values as this interaction
        this.demRenderer.setFreezeMinMax(true);

        // compute local minMax only when needed
        if (ol.Elevation.MinMaxNeighborhoodSize >= 0) {
            // get local max and min of the tile segments close to the dragged point
            minMaxLocal = this.demRenderer.getLocalMinMax(mapBrowserEvent.coordinate, this.view.getZoom());
            if (goog.isDef(minMaxLocal)) {
                this.minElevationLocal = minMaxLocal[0];
                this.maxElevationLocal = minMaxLocal[1];
            }
        } else {
            this.minElevationLocal = this.minElevation;
            this.maxElevationLocal = this.maxElevation;
        }

        mapCenter = this.view.getCenter();
        this.startDragPositionPx = ol.interaction.Pointer.centroid(this.targetPointers);
        this.startDragElevation = this.demRenderer.getElevation(mapBrowserEvent.coordinate, this.view.getZoom());
        this.startCenter = [mapCenter[0], mapCenter[1]];
        this.currentCenter = [mapCenter[0], mapCenter[1]];
        this.currentDragPositionPx = ol.interaction.Pointer.centroid(this.targetPointers);
        this.shearingStatus = ol.interaction.State.STATIC_SHEARING;
        this.animationDelay.stop();
        this.lastRenderTime = null;
        this.distanceX = this.distanceY = 0;
        this.vx_t_1 = this.vy_t_1 = 0;
        this.animationFrameCounter = 0;
        this.fpsMean = 0;

        // freeze values for elevation and coordinate indicator when dragging
        if (!goog.isNull(this.elevationIndicator)) {
            this.elevationIndicator.setFreeze(true);
        }

        return true;
    }
    return false;
};

/**
 * Stop all animations related this interaction
 */
ol.interaction.DragShearIntegrated.prototype.stopAnimation = function() {
    this.animationDelay.stop();
    this.lastRenderTime = null;
    this.distanceX = this.distanceY = 0;
    this.vx_t_1 = this.vy_t_1 = 0;
    this.shear(0, 0);
    this.shearingStatus = ol.interaction.State.NO_SHEARING;
};
goog.exportProperty(ol.interaction.DragShearIntegrated.prototype, 'stopAnimation', ol.interaction.DragShearIntegrated.prototype.stopAnimation);


/**
 * Enable animations related this interaction
 */
ol.interaction.DragShearIntegrated.prototype.enable = function() {
    this.view.setHint(ol.ViewHint.INTERACTING, -1);
};
goog.exportProperty(ol.interaction.DragShearIntegrated.prototype, 'enable', ol.interaction.DragShearIntegrated.prototype.enable);

/**
 * Disable animations related this interaction
 */
ol.interaction.DragShearIntegrated.prototype.disable = function() {
    if (!this.view.getHints()[ol.ViewHint.INTERACTING]) {
        this.view.setHint(ol.ViewHint.INTERACTING, 1);
    }
};
goog.exportProperty(ol.interaction.DragShearIntegrated.prototype, 'disable', ol.interaction.DragShearIntegrated.prototype.disable);

/**
 * Set options
 * @param {ol.interaction.DragShearIntegratedOptions} options
 */
ol.interaction.DragShearIntegrated.prototype.setOptions = function(options) {

    goog.asserts.assert(goog.isDef(options.threshold));
    goog.asserts.assert(goog.isDef(options.springCoefficient));
    goog.asserts.assert(goog.isDef(options.frictionForce));
    goog.asserts.assert(goog.isDef(options.maxInnerShearingPx));
    goog.asserts.assert(goog.isDef(options.maxOuterShearingPx));
    goog.asserts.assert(goog.isDef(options.staticShearFadeOutAnimationSpeed));
    // goog.asserts.assert(goog.isDef(options.hybridDampingDuration) && options.hybridDampingDuration > 0.0);

    this.options = options;
};
goog.exportProperty(ol.interaction.DragShearIntegrated.prototype, 'setOptions', ol.interaction.DragShearIntegrated.prototype.setOptions);

/**
 * Get average fps 
 * @return {number}
 */
ol.interaction.DragShearIntegrated.prototype.getFps = function() {
    return this.fpsMean / this.animationFrameCounter;
};
goog.exportProperty(ol.interaction.DragShearIntegrated.prototype, 'getFps', ol.interaction.DragShearIntegrated.prototype.getFps);


/**
 * Apply shearing to model and trigger rendering
 * @param {number} shearX
 * @param {number} shearY   
 * @this {ol.interaction.DragShearIntegrated}
 */
ol.interaction.DragShearIntegrated.prototype.shear = function(shearX, shearY) {
    this.demLayer.setTerrainShearing({
        x: shearX,
        y: shearY
    });
    this.demLayer.redraw();
};

/**
 * Animates shearing & panning according to currentDragPositionPx
 */
ol.interaction.DragShearIntegrated.prototype.animation = function() {

    var
    // mouse position [meters]
        currentDragPosition = this.map.getCoordinateFromPixel(this.currentDragPositionPx),
        // position of drag start [meters]
        startDragPosition = this.map.getCoordinateFromPixel(this.startDragPositionPx),
        // position of point that is animated [meters]. Compensate for shifted map center.
        animatingPositionX = startDragPosition[0] - (this.currentCenter[0] - this.startCenter[0]),
        animatingPositionY = startDragPosition[1] - (this.currentCenter[1] - this.startCenter[1]);

    // Distance between current mouse position and point being animated [meters].
    // This distance is also needed for fading out animation when the mouse is released after a static
    // shear. The annimation wiggles the mountains back to the start drag position. There
    // are no drag events during this animation that would adjust currentDragPositionPx, so we
    // use the previous distanceX and distanceY during the animation.
    if (this.shearingStatus !== ol.interaction.State.ANIMATION_AFTER_STATIC_SHEARING) {
        this.distanceX = currentDragPosition[0] - animatingPositionX;
        this.distanceY = currentDragPosition[1] - animatingPositionY;
    }

    var currentTime = new Date(),
        timeSinceHybridShearingStart = 0;
    if (this.hybridShearingStartTimeMS > 0) {
        timeSinceHybridShearingStart = (currentTime.getTime() - this.hybridShearingStartTimeMS) / 1000;
    }

    // A damping factor for fading the length of the spring between static and hybrid shearing.
    // When the cursor leaves circle with radius maxOuterShearingMeters, the damping factor is 1. 
    // It fades to 0 within the time interval defined by this.options['hybridDampingDuration'].
    var hybridShearingStartDamping = 1;
    if (this.shearingStatus === ol.interaction.State.HYBRID_SHEARING) {
        if (timeSinceHybridShearingStart <= this.options['hybridDampingDuration']) {
            hybridShearingStartDamping = 1 - timeSinceHybridShearingStart / this.options['hybridDampingDuration'];
        } else {
            // the damping animation is over
            hybridShearingStartDamping = 0;
            this.hybridShearingStartTimeMS = -1;
            this.springLength = 0;
        }
    }

    var distance = Math.sqrt(this.distanceX * this.distanceX + this.distanceY * this.distanceY),
        // spring lengths along the two axes [meters]
        springLengthX = distance > 0 ? this.distanceX / distance * this.springLength * hybridShearingStartDamping : 0,
        springLengthY = distance > 0 ? this.distanceY / distance * this.springLength * hybridShearingStartDamping : 0;

    // spring coefficient
    var k = this.options['springCoefficient'],
        // friction for damping previous speed
        friction = 1 - this.options['frictionForce'],
        // stretch or compression of the spring
        springStretchX = this.distanceX - springLengthX,
        springStretchY = this.distanceY - springLengthY,
        // current velocity of animation [meters per second]
        vx_t0 = k * springStretchX + friction * this.vx_t_1,
        vy_t0 = k * springStretchY + friction * this.vy_t_1;


    var
    // time since last frame was rendered [seconds]
        dTsec = this.lastRenderTime !== null ? (currentTime.getTime() - this.lastRenderTime.getTime()) / 1000 : 1 / 60,
        // displacement of clicked point due to spring [meters]
        dx = vx_t0 * dTsec,
        dy = vy_t0 * dTsec;


    // store values for next rendered frame
    this.vx_t_1 = vx_t0;
    this.vy_t_1 = vy_t0;

    if (this.shearingStatus === ol.interaction.State.ANIMATION_AFTER_STATIC_SHEARING) {
        // map center is not moved during animation following static shearing
        dx *= this.options['staticShearFadeOutAnimationSpeed'];
        dy *= this.options['staticShearFadeOutAnimationSpeed'];
    } else {
        // shift map center
        this.currentCenter[0] -= dx;
        this.currentCenter[1] -= dy;
    }


    // Test for end of animation: stop animation when speed and acceleration of the animation are close to zero.
    // The acceleration is triggered by the spring, and is proportional to the stretch of the spring.
    // The stretch is the length by which the spring differs from its resting position.
    var springStretch = Math.sqrt(springStretchX * springStretchX + springStretchY * springStretchY),
        // acceleration
        a = k * springStretch / dTsec,
        // velocity
        v = Math.sqrt(vx_t0 * vx_t0 + vy_t0 * vy_t0),
        // minimum distance
        dTol = this.options['threshold'] * this.view.getResolution(),
        // minimum velocity
        vTol = dTol / dTsec,
        // minimum acceleration
        aTol = vTol / dTsec / 100, // 100 is an empirical factor
        stopAnimation = this.shearingStatus !== ol.interaction.State.STATIC_SHEARING && a < aTol && v < vTol;

    // if (this.shearingStatus === ol.interaction.State.ANIMATION_AFTER_STATIC_SHEARING) {
    //  console.log("FPS", Math.round(1 / dTsec), "v", Math.round(v), "\tvTol", Math.round(vTol), "\ta", Math.round(a), "\taTol", Math.round(aTol));
    // }

    // compute average fps for userstudy
    this.animationFrameCounter++;
    this.fpsMean = this.fpsMean + Math.round(1 / dTsec); //(this.fpsMean + Math.round(1 / dTsec)) / this.animationFrameCounter;

    // Recompute distances after the new velocity is applied.
    this.distanceX -= dx;
    this.distanceY -= dy;

    // test for other active interactions like zooming or rotation
    var otherInteractionActive = this.view.getHints()[ol.ViewHint.INTERACTING];

    // FOR LOGGING PURPOSES
    // if (this.shearingStatus === ol.interaction.State.ANIMATION_AFTER_STATIC_SHEARING) {
    //     if (this.timeSinceAnimationBegin === null) {
    //         // reset logger
    //         this.timeSinceAnimationBegin = currentTime.getTime();
    //         // reset logger for new animation
    //         this.oscillationLogger = [];
    //         // add csv header
    //         this.oscillationLogger = 't;vx;vy;a;dx;dy\n0;0;0;0;\n';
    //     }

    //     // seconds since animation started
    //     var t = (currentTime.getTime() - this.timeSinceAnimationBegin) / 1000,
    //         aPixel = k * (springStretch / this.view.getResolution()) / dTsec;

    //     var newline = t + ';' + vx_t0 / this.view.getResolution() + ';' + vy_t0 / this.view.getResolution() + ';' + aPixel + ';' + dx / this.view.getResolution() + ';' + dy / this.view.getResolution() + '\n';
    //     this.oscillationLogger += newline;
    // }


    // update last rendering time
    this.lastRenderTime = currentTime;

    if (stopAnimation || otherInteractionActive) {
        // stop the animation
        this.stopAnimation();
        // console.log("animation ended");
        // console.log('fps: ' + this.getFps());
        // console.log(this.oscillationLogger);
        // this.timeSinceAnimationBegin = null;
    } else {
        // compute shearing distance
        var shearX = this.distanceX,
            shearY = this.distanceY;

        // if pointer is between the inner and the outer circle, limit shearing to the radius of the inner circle.
        if (this.shearingStatus === ol.interaction.State.STATIC_SHEARING) {
            var shearLength = Math.sqrt(this.distanceX * this.distanceX + this.distanceY * this.distanceY);
            if (shearLength > this.options['maxInnerShearingPx'] * this.view.getResolution()) {
                shearX = (this.distanceX / shearLength) * this.options['maxInnerShearingPx'] * this.view.getResolution();
                shearY = (this.distanceY / shearLength) * this.options['maxInnerShearingPx'] * this.view.getResolution();
            }
        }
        // value to normalize shearing factors for visible extent
        var normalizedDraggedElevation = (this.startDragElevation - this.minElevation) / (this.maxElevation - this.minElevation);
        // value to decide for a relatively low or a high point
        var normalizedDraggedElevationLocal = Math.abs((this.startDragElevation - this.minElevationLocal) / (this.maxElevationLocal - this.minElevationLocal));

        // console.log("clicked elevation: ", this.startDragElevation);
        // console.log("minimum elevation: ", this.minElevation);
        // console.log("maximum elevation: ", this.maxElevation);
        // console.log("relative elevation: ", normalizedDraggedElevation);
        // console.log("minimum elevation local: ", this.minElevationLocal);
        // console.log("maximum elevation local: ", this.maxElevationLocal);
        // console.log("relative elevation local: ", normalizedDraggedElevationLocal);

        if (normalizedDraggedElevationLocal > 0.5) {
            // console.log('higher point');
            // high elevations
            this.shear(shearX / normalizedDraggedElevation, shearY / normalizedDraggedElevation);
            if ((Math.abs(dx) > dTol || Math.abs(dy) > dTol) && this.shearingStatus !== ol.interaction.State.ANIMATION_AFTER_STATIC_SHEARING) {
                this.view.setCenter(this.view.constrainCenter([this.currentCenter[0], this.currentCenter[1]]));
            }
        } else {
            // console.log('lower point');
            // low elevations
            // invert shearing direction
            this.shear(-shearX, -shearY);
            // FIXME add similar test as for high elevations and only call setCenter if necessary?
            this.view.setCenter(this.view.constrainCenter([this.currentCenter[0] - this.distanceX, this.currentCenter[1] - this.distanceY]));
        }

        // trigger the next frame rendering   
        this.animationDelay.start();
    }
};
