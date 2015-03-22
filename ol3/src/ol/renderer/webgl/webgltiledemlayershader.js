// This file is automatically generated, do not edit
goog.provide('ol.renderer.webgl.tiledemlayer.shader');

goog.require('ol.webgl.shader');



/**
 * @constructor
 * @extends {ol.webgl.shader.Fragment}
 * @struct
 */
ol.renderer.webgl.tiledemlayer.shader.Fragment = function() {
  goog.base(this, ol.renderer.webgl.tiledemlayer.shader.Fragment.SOURCE);
};
goog.inherits(ol.renderer.webgl.tiledemlayer.shader.Fragment, ol.webgl.shader.Fragment);
goog.addSingletonGetter(ol.renderer.webgl.tiledemlayer.shader.Fragment);


/**
 * @const
 * @type {string}
 */
ol.renderer.webgl.tiledemlayer.shader.Fragment.DEBUG_SOURCE = 'precision highp float;\n\n// texture with encoded elevation values\nuniform sampler2D u_texture;\n\n// length of one tile in meter at equator\nuniform float u_tileSizeM;\n\n// min Elevation in current Extent\nuniform float u_minElevation; \n\n// max Elevation in current Extent\nuniform float u_maxElevation;\n\n// temporary variable for coord transfer to fragment shader\nvarying vec2 v_texCoord;\n\n// decodes input data elevation value and apply exaggeration\nfloat decodeElevation(in vec4 colorChannels) {\n    float elevationM = 0.0;\n    if(colorChannels.b == 0.0 && colorChannels.a == 1.0){\n        elevationM = (colorChannels.r*255.0 + (colorChannels.g*255.0)*256.0)-11000.0;\n    }\n    return elevationM;\n}\n\n\n// color ramp texture to look up hypsometric tints\nuniform sampler2D u_colorRamp;\n\n// texture with overlay map\nuniform sampler2D u_overlayTexture;\n\n// flag for coloring inland waterbodies\nuniform bool u_waterBodies; \n\n// flag for hillShading\nuniform bool u_hillShading; \n\n// flag for active overlay texture\nuniform bool u_overlayActive;\n\n// flag for testing mode\nuniform bool u_testing;    \n\n// scale threshold values to adapt color ramp \n// u_colorScale.x is lower threshold, u_colorScale.y is upper threshold\nuniform vec2 u_colorScale;\n\n// direction of light source\nuniform vec3 u_light; \n\n// hillShading Opacity for Blending\nuniform float u_hillShadingOpacity; \n\n// hillShading Exaggeration\nuniform float u_hsExaggeration; \n\n// intensity of ambient light\nuniform float u_ambient_light;    \n\n// critical elevation threshold\nuniform float u_critElThreshold;  \n\n// cellsize for tile resolution of 256x256 pixel = 1.0/256.0\nconst highp float CELLSIZE = 0.00390625; \n\nvoid main(void) {\n        vec2 m_texCoord = v_texCoord;\n\n        // prevent artifacts at tile borders, shift texture coordinates\n        if(m_texCoord.x >= 1.0-CELLSIZE){ // eastern border of tile                \n            m_texCoord.x = m_texCoord.x - CELLSIZE;\n        }\n\n        if(m_texCoord.x < CELLSIZE){ // western border of tile                \n            m_texCoord.x = m_texCoord.x + CELLSIZE;\n        }\n\n        if(m_texCoord.y >= 1.0-CELLSIZE){ // northern border of tile                \n            m_texCoord.y = m_texCoord.y - CELLSIZE;\n        }\n\n        if(m_texCoord.y < CELLSIZE){ // southern border of tile                \n            m_texCoord.y = m_texCoord.y + CELLSIZE;\n        }\n\n        // read and decode elevation values from tile texture\n        float absElevation = decodeElevation(texture2D(u_texture, m_texCoord.xy));\n\n        // read neighboring values\n        float neighborRight = decodeElevation(texture2D(u_texture, vec2(m_texCoord.x+CELLSIZE, m_texCoord.y)));\n        float neighborLeft = decodeElevation(texture2D(u_texture, vec2(m_texCoord.x-CELLSIZE, m_texCoord.y)));\n        float neighborAbove = decodeElevation(texture2D(u_texture, vec2(m_texCoord.x, m_texCoord.y+CELLSIZE)));\n        float neighborBelow = decodeElevation(texture2D(u_texture, vec2(m_texCoord.x, m_texCoord.y-CELLSIZE)));          \n          \n    // texture\n        vec4 fragColor;\n\n        if(u_overlayActive){\n             // use overlay texture color\n             fragColor = texture2D(u_overlayTexture, m_texCoord);\n        } else {\n            // lookup a hypsometric color        \n                // scaling of color ramp\n                float elevationRange = u_maxElevation-u_minElevation;\n                float colorMin = u_colorScale.x/elevationRange;\n                float colorMax = u_colorScale.y/elevationRange;             \n                float relativeElevation = ((absElevation/elevationRange) - colorMin) / (colorMax - colorMin);\n                \n                // read corresponding value from color ramp texture\n                fragColor = abs(texture2D(u_colorRamp,vec2(0.5,relativeElevation)));\n\n                // color for water surfaces in flat terrain\n                if(u_waterBodies) {\n                    vec4 waterBlue = vec4(0.4058823529,0.6725490196,0.8970588235,1.0);\n\n                    // compute other neighbors for water surface test\n                    float n01 = decodeElevation(texture2D(u_texture, vec2(m_texCoord.x+CELLSIZE, m_texCoord.y+CELLSIZE)));\n                    float n02 = decodeElevation(texture2D(u_texture, vec2(m_texCoord.x-CELLSIZE, m_texCoord.y+CELLSIZE)));\n                    float n03 = decodeElevation(texture2D(u_texture, vec2(m_texCoord.x+CELLSIZE, m_texCoord.y-CELLSIZE)));\n                    float n04 = decodeElevation(texture2D(u_texture, vec2(m_texCoord.x-CELLSIZE, m_texCoord.y+CELLSIZE)));         \n\n                    if(n01 == absElevation && \n                       n02 == absElevation && \n                       n03 == absElevation && \n                       n04 == absElevation && \n                       neighborRight == absElevation && \n                       neighborLeft == absElevation && \n                       neighborAbove == absElevation && \n                       neighborBelow == absElevation) \n                    {\n                        fragColor = waterBlue; \n                    }\n                } \n        }\n\n    // computation of hillshading\n        if(u_hillShading){\n\n            // apply exaggeration\n            float exaggerationFactor = max(u_hsExaggeration*10.0,1.0);\n\n            // compute normal with values from four neighbors\n            vec3 normal = vec3(  neighborLeft - neighborRight,\n                                 neighborAbove - neighborBelow,\n                                 CELLSIZE * u_tileSizeM / exaggerationFactor);\n           \n            // compute the dot product of the normal and the light vector. This\n            // gives a value between -1 (surface faces directly away from\n            // light) and 1 (surface faces directly toward light)\n            float hillShade = dot(normal,normalize(u_light)) / length(normal);\n\n            // apply ambient light and adjust value to be between 0.0 and 1.0\n            hillShade = clamp(u_ambient_light * 1.0 + (hillShade + 1.0) * 0.5, 0.0, 1.0);\n\n            // remap image tonality\n            hillShade = pow(hillShade, 1.0 / (1.0 + u_hillShadingOpacity * 2.0));\n\n            // avoid black shadows\n            hillShade = max(hillShade, 0.25);\n\n            // mix with hypsometric color\n            gl_FragColor = vec4(hillShade,hillShade,hillShade,1.0)*fragColor;\n        } else {\n            // apply hypsometric color without hillshading\n            gl_FragColor = fragColor;\n        }\n\n    // testing mode\n        if(u_testing){\n            // highlight maxima and minima \n            float criticalEl = u_minElevation + (u_maxElevation - u_minElevation) * u_critElThreshold;\n            if(absElevation > criticalEl){\n                gl_FragColor = gl_FragColor+vec4(1.0,0.0,0.0,1.0);\n            }\n            if(absElevation < criticalEl){\n                gl_FragColor = gl_FragColor+vec4(0.0,0.5,0.5,1.0);\n            }\n            // mark tile borders and draw a grid\n            float lineWidth = 2.0 * CELLSIZE;\n            if(m_texCoord.x >= 1.0-lineWidth){\n                gl_FragColor = vec4(0.0,0.0,1.0,1.0);\n            }\n            if(m_texCoord.x <= lineWidth){\n                gl_FragColor = vec4(1.0,0.0,0.0,1.0);\n            }\n            if(m_texCoord.y <= lineWidth){\n                gl_FragColor = vec4(0.0,1.0,0.0,1.0);\n            }\n            if(m_texCoord.y >= 1.0-lineWidth){\n                gl_FragColor = vec4(0.0,0.5,0.5,1.0);\n            } \n            if(mod(m_texCoord.x,65.0*CELLSIZE) < CELLSIZE){\n               gl_FragColor = vec4(0.9,0.9,0.9,0.1);\n            }\n            if(mod(m_texCoord.y,65.0*CELLSIZE) < CELLSIZE){\n               gl_FragColor = vec4(0.9,0.9,0.9,0.1);\n            }\n          \n        }\n}\n';


/**
 * @const
 * @type {string}
 */
ol.renderer.webgl.tiledemlayer.shader.Fragment.OPTIMIZED_SOURCE = 'precision highp float;uniform sampler2D a;uniform float b;uniform float c;uniform float d;varying vec2 e;float decodeElevation(in vec4 colorChannels){float elevationM=0.0;if(colorChannels.b==0.0&&colorChannels.a==1.0){elevationM=(colorChannels.r*255.0+(colorChannels.g*255.0)*256.0)-11000.0;}return elevationM;}uniform sampler2D j;uniform sampler2D k;uniform bool l;uniform bool m;uniform bool n;uniform bool o;uniform vec2 p;uniform vec3 q;uniform float r;uniform float s;uniform float t;uniform float u;const highp float CELLSIZE=0.00390625;void main(void){vec2 m_texCoord=e;if(m_texCoord.x>=1.0-CELLSIZE){m_texCoord.x=m_texCoord.x-CELLSIZE;}if(m_texCoord.x<CELLSIZE){m_texCoord.x=m_texCoord.x+CELLSIZE;}if(m_texCoord.y>=1.0-CELLSIZE){m_texCoord.y=m_texCoord.y-CELLSIZE;}if(m_texCoord.y<CELLSIZE){m_texCoord.y=m_texCoord.y+CELLSIZE;}float absElevation=decodeElevation(texture2D(a,m_texCoord.xy));float neighborRight=decodeElevation(texture2D(a,vec2(m_texCoord.x+CELLSIZE,m_texCoord.y)));float neighborLeft=decodeElevation(texture2D(a,vec2(m_texCoord.x-CELLSIZE,m_texCoord.y)));float neighborAbove=decodeElevation(texture2D(a,vec2(m_texCoord.x,m_texCoord.y+CELLSIZE)));float neighborBelow=decodeElevation(texture2D(a,vec2(m_texCoord.x,m_texCoord.y-CELLSIZE)));vec4 fragColor;if(n){fragColor=texture2D(k,m_texCoord);}else{float elevationRange=d-c;float colorMin=p.x/elevationRange;float colorMax=p.y/elevationRange;float relativeElevation=((absElevation/elevationRange)-colorMin)/(colorMax-colorMin);fragColor=abs(texture2D(j,vec2(0.5,relativeElevation)));if(l){vec4 waterBlue=vec4(0.4058823529,0.6725490196,0.8970588235,1.0);float n01=decodeElevation(texture2D(a,vec2(m_texCoord.x+CELLSIZE,m_texCoord.y+CELLSIZE)));float n02=decodeElevation(texture2D(a,vec2(m_texCoord.x-CELLSIZE,m_texCoord.y+CELLSIZE)));float n03=decodeElevation(texture2D(a,vec2(m_texCoord.x+CELLSIZE,m_texCoord.y-CELLSIZE)));float n04=decodeElevation(texture2D(a,vec2(m_texCoord.x-CELLSIZE,m_texCoord.y+CELLSIZE)));if(n01==absElevation&&n02==absElevation&&n03==absElevation&&n04==absElevation&&neighborRight==absElevation&&neighborLeft==absElevation&&neighborAbove==absElevation&&neighborBelow==absElevation){fragColor=waterBlue;}}}if(m){float exaggerationFactor=max(s*10.0,1.0);vec3 normal=vec3(neighborLeft-neighborRight,neighborAbove-neighborBelow,CELLSIZE*b/exaggerationFactor);float hillShade=dot(normal,normalize(q))/length(normal);hillShade=clamp(t*1.0+(hillShade+1.0)*0.5,0.0,1.0);hillShade=pow(hillShade,1.0/(1.0+r*2.0));hillShade=max(hillShade,0.25);gl_FragColor=vec4(hillShade,hillShade,hillShade,1.0)*fragColor;}else{gl_FragColor=fragColor;}if(o){float criticalEl=c+(d-c)*u;if(absElevation>criticalEl){gl_FragColor=gl_FragColor+vec4(1.0,0.0,0.0,1.0);}if(absElevation<criticalEl){gl_FragColor=gl_FragColor+vec4(0.0,0.5,0.5,1.0);}float lineWidth=2.0*CELLSIZE;if(m_texCoord.x>=1.0-lineWidth){gl_FragColor=vec4(0.0,0.0,1.0,1.0);}if(m_texCoord.x<=lineWidth){gl_FragColor=vec4(1.0,0.0,0.0,1.0);}if(m_texCoord.y<=lineWidth){gl_FragColor=vec4(0.0,1.0,0.0,1.0);}if(m_texCoord.y>=1.0-lineWidth){gl_FragColor=vec4(0.0,0.5,0.5,1.0);}if(mod(m_texCoord.x,65.0*CELLSIZE)<CELLSIZE){gl_FragColor=vec4(0.9,0.9,0.9,0.1);}if(mod(m_texCoord.y,65.0*CELLSIZE)<CELLSIZE){gl_FragColor=vec4(0.9,0.9,0.9,0.1);}}}';


/**
 * @const
 * @type {string}
 */
ol.renderer.webgl.tiledemlayer.shader.Fragment.SOURCE = goog.DEBUG ?
    ol.renderer.webgl.tiledemlayer.shader.Fragment.DEBUG_SOURCE :
    ol.renderer.webgl.tiledemlayer.shader.Fragment.OPTIMIZED_SOURCE;



/**
 * @constructor
 * @extends {ol.webgl.shader.Vertex}
 * @struct
 */
ol.renderer.webgl.tiledemlayer.shader.Vertex = function() {
  goog.base(this, ol.renderer.webgl.tiledemlayer.shader.Vertex.SOURCE);
};
goog.inherits(ol.renderer.webgl.tiledemlayer.shader.Vertex, ol.webgl.shader.Vertex);
goog.addSingletonGetter(ol.renderer.webgl.tiledemlayer.shader.Vertex);


/**
 * @const
 * @type {string}
 */
ol.renderer.webgl.tiledemlayer.shader.Vertex.DEBUG_SOURCE = '\n// texture with encoded elevation values\nuniform sampler2D u_texture;\n\n// length of one tile in meter at equator\nuniform float u_tileSizeM;\n\n// min Elevation in current Extent\nuniform float u_minElevation; \n\n// max Elevation in current Extent\nuniform float u_maxElevation;\n\n// temporary variable for coord transfer to fragment shader\nvarying vec2 v_texCoord;\n\n// decodes input data elevation value and apply exaggeration\nfloat decodeElevation(in vec4 colorChannels) {\n    float elevationM = 0.0;\n    if(colorChannels.b == 0.0 && colorChannels.a == 1.0){\n        elevationM = (colorChannels.r*255.0 + (colorChannels.g*255.0)*256.0)-11000.0;\n    }\n    return elevationM;\n}\n\n\n// vertex coordinates for tile mesh\nattribute vec2 a_position;\n\n// tile offset in current framebuffer view\nuniform vec4 u_tileOffset;\n\n// current shearing factor\nuniform vec2 u_scaleFactor;\n\n// current depth depends on zoomlevel\nuniform float u_z;\n\nvoid main(void) { \n\n    // Orientation of coordinate system in vertex shader:\n    // y\n    // ^ \n    // |\n    // |\n    // ------>  x\n\n    // pass current vertex coordinates to fragment shader\n    v_texCoord = a_position;\n    \n    // compute y-flipped texture coordinates for further processing in fragment-shader\n    v_texCoord.y = 1.0 - v_texCoord.y;\n\n    // read and decode elevation for current vertex\n    float absElevation = decodeElevation(texture2D(u_texture, v_texCoord.xy));\n    \n    // normalize elevation for current minimum and maximum\n    float nElevation = u_maxElevation*(absElevation-u_minElevation)/(u_maxElevation-u_minElevation); \n\n    // shift vertex positions by given shearing factors\n    // z value has to be inverted to get a left handed coordinate system and to make the depth test work\n    gl_Position = vec4((a_position+(nElevation * u_scaleFactor.xy) / u_tileSizeM) * u_tileOffset.xy + u_tileOffset.zw, \n                        (u_z-abs(absElevation/u_tileSizeM)), \n                        1.0);\n}\n\n';


/**
 * @const
 * @type {string}
 */
ol.renderer.webgl.tiledemlayer.shader.Vertex.OPTIMIZED_SOURCE = 'uniform sampler2D a;uniform float b;uniform float c;uniform float d;varying vec2 e;float decodeElevation(in vec4 colorChannels){float elevationM=0.0;if(colorChannels.b==0.0&&colorChannels.a==1.0){elevationM=(colorChannels.r*255.0+(colorChannels.g*255.0)*256.0)-11000.0;}return elevationM;}attribute vec2 f;uniform vec4 g;uniform vec2 h;uniform float i;void main(void){e=f;e.y=1.0-e.y;float absElevation=decodeElevation(texture2D(a,e.xy));float nElevation=d*(absElevation-c)/(d-c);gl_Position=vec4((f+(nElevation*h.xy)/b)*g.xy+g.zw,(i-abs(absElevation/b)),1.0);}';


/**
 * @const
 * @type {string}
 */
ol.renderer.webgl.tiledemlayer.shader.Vertex.SOURCE = goog.DEBUG ?
    ol.renderer.webgl.tiledemlayer.shader.Vertex.DEBUG_SOURCE :
    ol.renderer.webgl.tiledemlayer.shader.Vertex.OPTIMIZED_SOURCE;



/**
 * @constructor
 * @param {WebGLRenderingContext} gl GL.
 * @param {WebGLProgram} program Program.
 * @struct
 */
ol.renderer.webgl.tiledemlayer.shader.Locations = function(gl, program) {

  /**
   * @type {WebGLUniformLocation}
   */
  this.u_ambient_light = gl.getUniformLocation(
      program, goog.DEBUG ? 'u_ambient_light' : 't');

  /**
   * @type {WebGLUniformLocation}
   */
  this.u_colorRamp = gl.getUniformLocation(
      program, goog.DEBUG ? 'u_colorRamp' : 'j');

  /**
   * @type {WebGLUniformLocation}
   */
  this.u_colorScale = gl.getUniformLocation(
      program, goog.DEBUG ? 'u_colorScale' : 'p');

  /**
   * @type {WebGLUniformLocation}
   */
  this.u_critElThreshold = gl.getUniformLocation(
      program, goog.DEBUG ? 'u_critElThreshold' : 'u');

  /**
   * @type {WebGLUniformLocation}
   */
  this.u_hillShading = gl.getUniformLocation(
      program, goog.DEBUG ? 'u_hillShading' : 'm');

  /**
   * @type {WebGLUniformLocation}
   */
  this.u_hillShadingOpacity = gl.getUniformLocation(
      program, goog.DEBUG ? 'u_hillShadingOpacity' : 'r');

  /**
   * @type {WebGLUniformLocation}
   */
  this.u_hsExaggeration = gl.getUniformLocation(
      program, goog.DEBUG ? 'u_hsExaggeration' : 's');

  /**
   * @type {WebGLUniformLocation}
   */
  this.u_light = gl.getUniformLocation(
      program, goog.DEBUG ? 'u_light' : 'q');

  /**
   * @type {WebGLUniformLocation}
   */
  this.u_maxElevation = gl.getUniformLocation(
      program, goog.DEBUG ? 'u_maxElevation' : 'd');

  /**
   * @type {WebGLUniformLocation}
   */
  this.u_minElevation = gl.getUniformLocation(
      program, goog.DEBUG ? 'u_minElevation' : 'c');

  /**
   * @type {WebGLUniformLocation}
   */
  this.u_overlayActive = gl.getUniformLocation(
      program, goog.DEBUG ? 'u_overlayActive' : 'n');

  /**
   * @type {WebGLUniformLocation}
   */
  this.u_overlayTexture = gl.getUniformLocation(
      program, goog.DEBUG ? 'u_overlayTexture' : 'k');

  /**
   * @type {WebGLUniformLocation}
   */
  this.u_scaleFactor = gl.getUniformLocation(
      program, goog.DEBUG ? 'u_scaleFactor' : 'h');

  /**
   * @type {WebGLUniformLocation}
   */
  this.u_testing = gl.getUniformLocation(
      program, goog.DEBUG ? 'u_testing' : 'o');

  /**
   * @type {WebGLUniformLocation}
   */
  this.u_texture = gl.getUniformLocation(
      program, goog.DEBUG ? 'u_texture' : 'a');

  /**
   * @type {WebGLUniformLocation}
   */
  this.u_tileOffset = gl.getUniformLocation(
      program, goog.DEBUG ? 'u_tileOffset' : 'g');

  /**
   * @type {WebGLUniformLocation}
   */
  this.u_tileSizeM = gl.getUniformLocation(
      program, goog.DEBUG ? 'u_tileSizeM' : 'b');

  /**
   * @type {WebGLUniformLocation}
   */
  this.u_waterBodies = gl.getUniformLocation(
      program, goog.DEBUG ? 'u_waterBodies' : 'l');

  /**
   * @type {WebGLUniformLocation}
   */
  this.u_z = gl.getUniformLocation(
      program, goog.DEBUG ? 'u_z' : 'i');

  /**
   * @type {number}
   */
  this.a_position = gl.getAttribLocation(
      program, goog.DEBUG ? 'a_position' : 'f');
};
