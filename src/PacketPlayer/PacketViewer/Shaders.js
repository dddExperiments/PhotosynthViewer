"use strict";

/*
	The MIT License (MIT)

	Copyright (c) Microsoft Corporation

	Permission is hereby granted, free of charge, to any person obtaining a copy
	of this software and associated documentation files (the "Software"), to deal
	in the Software without restriction, including without limitation the rights
	to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
	copies of the Software, and to permit persons to whom the Software is
	furnished to do so, subject to the following conditions:

	The above copyright notice and this permission notice shall be included in
	all copies or substantial portions of the Software.

	THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
	IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
	FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
	AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
	LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
	OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
	THE SOFTWARE.
*/

PS.Packet.Shaders = {};

PS.Packet.Shaders.commonMaterial = {

	uniforms: {
		"tDiffuse": { type: "t", value: null }
	},

	vertexShader: [
		"varying vec2 vUv;",

		"void main() {",
		"	vUv = uv;",
		"	gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);",
		"}"

	].join("\n"),

	fragmentShader: [
		"varying vec2 vUv;",
		"uniform sampler2D tDiffuse;",
		"void main() {",
		"	gl_FragColor =  texture2D(tDiffuse, vUv.xy);",
		"}"
	].join("\n")
};

PS.Packet.Shaders.downsamplingMaterial = {
	fragmentShader: [
		"varying vec2 vUv;",
		"uniform sampler2D uReduceTex;",
		"uniform float uReduceDx;",
		"uniform float uReduceDy;",

		"void main (void)",
		"{",

		/*
		//slow version [4 texture fetch]
		"	vec4 color0 = texture2D(uReduceTex, vUv + vec2(-uReduceDx,  -uReduceDy));",
		"	vec4 color1 = texture2D(uReduceTex, vUv + vec2( uReduceDx,  -uReduceDy));",
		"	vec4 color2 = texture2D(uReduceTex, vUv + vec2(-uReduceDx,   uReduceDy));",
		"	vec4 color3 = texture2D(uReduceTex, vUv + vec2( uReduceDx,   uReduceDy));",
		"	gl_FragColor = 0.25 * (color0 + color1 + color2 + color3);",
		*/

		//fast version [2 texture fetch] - rendering is different but acceptable
		"	vec4 color0 = texture2D(uReduceTex, vUv + vec2(-uReduceDx,  0));",
		"	vec4 color1 = texture2D(uReduceTex, vUv + vec2( uReduceDx,  0));",
		"	gl_FragColor = 0.5 * (color0 + color1);",

		"}"
	].join("\n")
};

PS.Packet.Shaders.upsamplingMaterial = {
	fragmentShader: [
		"varying vec2 vUv;",
		"uniform sampler2D uExpandTex0;",
		"uniform sampler2D uExpandTex1;",

		"void main (void)",
		"{",
		"	vec4 up = texture2D(uExpandTex0, vUv);",

		"	if (up.a > 0.0)",
		"	{",
		"		up /= up.a;",
		"	}",

		"	vec4 orig = texture2D(uExpandTex1, vUv);",

		"	if (orig.a > 0.0)",
		"	{",
		"		orig.rgb /= orig.a;",
		"	}",

		"	gl_FragColor = vec4(mix(up.rgb, orig.rgb, orig.a), 1);",

		"}"
	].join("\n")
};

PS.Packet.Shaders.Shader = function(uniforms, vertexShader, fragmentShader) {
	this.uniforms       = uniforms;
	this.vertexShader   = vertexShader;
	this.fragmentShader = fragmentShader;
};

PS.Packet.Shaders.Factory = {

	generateProjectiveShaders: function(options) {
		var _options = {
			thumbnailAtlasShader:      false,
			debugPolygonColorEnabled:  false,
			featheringBlendingEnabled: false,
			opacityOverrideEnabled:    false,
			positioningEnabled:        false,
			overrideColorEnabled:      false
			//TODO: make color balancing optional
		};
		PS.extend(_options, options);

		//UNIFORMS
		var uniforms = {
			colorTex:      { type: "t",  value: null },
			colorScale:    { type: "v4", value: new THREE.Vector4(1,1,1,1)},
			textureMatrix: { type: "m4", value: new THREE.Matrix4() }
		};
		if (_options.debugPolygonColorEnabled) {
			uniforms = PS.extend(uniforms, {
				debugBlending: { type: "f", value: 1.0}
			});
		}
		if (_options.thumbnailAtlasShader) {
			uniforms = PS.extend(uniforms, {
				thumbnail: { type: "v4", value: new THREE.Vector4(0,0,0,0)}
			});
		}
		if (_options.opacityOverrideEnabled) {
			uniforms = PS.extend(uniforms, {
				opacity: { type: "f", value: 1.0}
			});
		}

		//VERTEX SHADER
		var vertexShader = "";
		vertexShader += "uniform mat4 textureMatrix;\n";
		vertexShader += "varying vec4 vUv;\n";
		if (_options.debugPolygonColorEnabled) {
			vertexShader += "varying vec3 vColor;\n";
		}
		vertexShader += "void main() {\n";
		vertexShader += "	gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );\n";
		if (_options.positioningEnabled) {
			vertexShader += "	vUv = textureMatrix * modelMatrix * vec4(position, 1.0);\n";
		}
		else {
			vertexShader += "	vUv = textureMatrix * vec4(position, 1.0);\n";
		}
		if (_options.debugPolygonColorEnabled) {
			vertexShader += "	vColor = color;\n";
		}
		vertexShader += "}\n";

		//FRAGMENT SHADER
		var fragmentShader = "";
		fragmentShader += "uniform sampler2D colorTex;\n";
		fragmentShader += "uniform vec4 colorScale;\n";
		fragmentShader += "varying vec4 vUv;\n";
		if (_options.thumbnailAtlasShader) {
			fragmentShader += "uniform vec4 thumbnail;\n";
		}
		if (_options.debugPolygonColorEnabled) {
			fragmentShader += "uniform float debugBlending;\n";
			fragmentShader += "varying vec3 vColor;\n";
		}
		if (_options.opacityOverrideEnabled) {
			fragmentShader += "uniform float opacity;\n";
		}

		if (_options.featheringBlendingEnabled) {

			// linear ramp
			fragmentShader += "float linearFeather(vec2 xy) {\n";
			fragmentShader += "	float dx = min(xy.x, 1.0-xy.x);\n";
			fragmentShader += "	float dy = min(xy.y, 1.0-xy.y);\n";
			fragmentShader += "	float d = min(dx,dy);\n";
			fragmentShader += "	return d;\n";
			fragmentShader += "}\n";

			// radial ramp
			fragmentShader += "float radialFeather(vec2 xy) {\n";
			fragmentShader += "	float rx = xy.x - 0.5;\n";
			fragmentShader += "	float ry = xy.y - 0.5;\n";
			fragmentShader += "	float r = sqrt(rx*rx + ry*ry);\n";

			fragmentShader += "	const float sqrt2 =  1.41421356237310;\n";
			fragmentShader += "	r = 1.0 - sqrt2 * r;\n";

			fragmentShader += "	return r;\n";
			fragmentShader += "}\n";

			// non-linear mixing
			fragmentShader += "float mixAndClamp(float d, float r) {\n";
			fragmentShader += "	const float linearThresh = 5.0;\n";
			fragmentShader += "	const float radialThresh = 1.0;\n";

			fragmentShader += "	d = clamp(d * linearThresh, 0.0, 1.0);\n";
			fragmentShader += "	r = clamp(r * radialThresh, 0.0, 1.0);\n";

			fragmentShader += "	float alpha = 2.0 / (1.0/r + 1.0/d);\n";
			fragmentShader += "	alpha = r * d;\n";

			fragmentShader += "	alpha = clamp(alpha, 0.0, 1.0);\n";
			fragmentShader += "	return alpha;\n";
			fragmentShader += "}\n";

			// non-linear mixing
			fragmentShader += "vec4 feather(vec4 c, vec2 xy) {\n";

				// feather
			fragmentShader += "	float d = linearFeather(xy);\n";
			fragmentShader += "	float r = radialFeather(xy);\n";

				// mix and clamp
			fragmentShader += "	float alpha = mixAndClamp(d, r);\n";
			fragmentShader += "	c.a = alpha;\n";
			fragmentShader += "	return c;\n";
			fragmentShader += "}\n";

		}

		fragmentShader += "void main() {\n";

		fragmentShader += "	vec4 t = vUv;\n";

		if (!_options.thumbnailAtlasShader || _options.featheringBlendingEnabled) {
			fragmentShader += "	vec2 xy = vec2(t.x/t.z, 1.0-t.y/t.z);\n";
		}
		if (_options.debugPolygonColorEnabled) {
			fragmentShader += "	vec4 polygonColor = vec4(vColor, 1.0);\n";
		}

		if (_options.thumbnailAtlasShader) {
			fragmentShader += "	vec4 textureColor = texture2D(colorTex, vec2(t.x/t.z*thumbnail.z+thumbnail.x, 1.0-t.y/t.z*thumbnail.w+thumbnail.y));\n";
		}
		else {
			fragmentShader += "	vec4 textureColor = texture2D(colorTex, xy);\n";
		}

		//color balancing
		fragmentShader += "float scaleWt = clamp(0.8*(3.0-dot(textureColor.rgb,textureColor.rgb)), 0.0, 1.0);\n";
		fragmentShader += "textureColor.rgb = mix(textureColor.rgb, colorScale.rgb*textureColor.rgb, scaleWt);\n";

		//feathering
		if (_options.featheringBlendingEnabled) {
			fragmentShader += "textureColor = feather(textureColor, xy);\n";
		}

		if (_options.debugPolygonColorEnabled) {
			fragmentShader += "	gl_FragColor = mix(polygonColor, textureColor, debugBlending);\n";
		}
		else {
			fragmentShader += "	gl_FragColor = textureColor;\n";
		}

		if (_options.opacityOverrideEnabled) {
			fragmentShader += "	gl_FragColor.a = opacity;\n";
		}

		if (_options.overrideColorEnabled) {
			fragmentShader += "	gl_FragColor.rgb = vec3(1, 0, 1);\n";
		}


		fragmentShader += "}\n";

		return new PS.Packet.Shaders.Shader(uniforms, vertexShader, fragmentShader);
	},


	generateBlendingShaders: function(options) {
		var _options = {
			blendingMode: PS.Packet.BlendingMode.Opacity
		};
		PS.extend(_options, options);

		//UNIFORMS
		var uniforms = {
			tDiffuse1: { type: "t", value: null },
			tDiffuse2: { type: "t", value: null },
			blendFactor: { type: "f", value: 0.5 }
		};
		if (_options.blendingMode === PS.Packet.BlendingMode.DitheringLuminance ||
			_options.blendingMode === PS.Packet.BlendingMode.DitheringColor) {
			uniforms = PS.extend(uniforms, {
				tRandom: { type: "t", value: null },
				texSize: { type: "v2", value: new THREE.Vector2()}
			});
		}
		//VERTEX SHADER
		var vertexShader = PS.Packet.Shaders.commonMaterial.vertexShader;

		//FRAGMENT SHADER
		var fragmentShader = "";
		fragmentShader += "varying vec2 vUv;\n";
		fragmentShader += "uniform sampler2D tDiffuse1;\n";
		fragmentShader += "uniform sampler2D tDiffuse2;\n";
		if (_options.blendingMode === PS.Packet.BlendingMode.DitheringLuminance ||
			_options.blendingMode === PS.Packet.BlendingMode.DitheringColor) {
			fragmentShader += "uniform sampler2D tRandom;\n";
			fragmentShader += "uniform vec2 texSize;\n";
		}
		fragmentShader += "uniform float blendFactor;\n";

		if (_options.blendingMode === PS.Packet.BlendingMode.Feathering) {
			fragmentShader += "float computeWeight(float alpha0, float alpha1) {\n";
			fragmentShader += "	float edgeWeight = alpha0 / (alpha0 + alpha1);\n";

			fragmentShader += "	float weight0 = blendFactor * edgeWeight;\n";
			fragmentShader += "	float weight1 = (1.0-blendFactor) * (1.0-edgeWeight);\n";

			fragmentShader += "	weight0 = weight0 / (weight0 + weight1);\n";
			fragmentShader += "	return weight0;\n";
			fragmentShader += "}\n";
		}

		fragmentShader += "void main() {\n";
		fragmentShader += "	vec4 color0 = texture2D(tDiffuse1, vUv);\n";
		fragmentShader += "	vec4 color1 = texture2D(tDiffuse2, vUv);\n";
		if (_options.blendingMode === PS.Packet.BlendingMode.DitheringLuminance ||
			_options.blendingMode === PS.Packet.BlendingMode.DitheringColor) {
			fragmentShader += "	vec2 uvCoord2 = vUv*texSize*vec2(1.0/128.0, 1.0/128.0);\n"; //use 1/256 instead of 1/128 to make the noise bigger
		}
		if (_options.blendingMode === PS.Packet.BlendingMode.DitheringLuminance) {
			fragmentShader += "	float prob = float(blendFactor <= texture2D(tRandom, uvCoord2).r);\n";
		}
		else if (_options.blendingMode === PS.Packet.BlendingMode.DitheringColor) {
			fragmentShader += "	bvec3 prob   = lessThanEqual(vec3(blendFactor, blendFactor, blendFactor), texture2D(tRandom, uvCoord2).rgb);\n";
			fragmentShader += "	vec3  probf  = vec3(float(prob.x), float(prob.y), float(prob.z));\n";
			fragmentShader += "	bvec3 nprob  = not(prob);\n";
			fragmentShader += "	vec3  nprobf = vec3(float(nprob.x), float(nprob.y), float(nprob.z));\n";
		}

		fragmentShader += "	const float epsilon = 0.001;\n";

		fragmentShader += "	vec4 color;\n";

		//tDiffuse1 and tDiffuse2 are not visible -> transparent black
		fragmentShader += "	if (color0.a < epsilon && color1.a < epsilon)\n";
		fragmentShader += "	{\n";
		fragmentShader += "		color = vec4(0, 0, 0, 0);\n";
		fragmentShader += "	}\n";

		//tDiffuse1 is not visible and tDiffuse2 is visible -> tDiffuse2
		fragmentShader += "	else if (color0.a < epsilon && color1.a >= epsilon)\n";
		fragmentShader += "	{\n";
		fragmentShader += "		color = color1;\n";
		if (_options.blendingMode === PS.Packet.BlendingMode.Feathering) {
			fragmentShader += "		color.a = 1.0;\n";
		}
		fragmentShader += "	}\n";

		//tDiffuse1 is visible and tDiffuse2 is not visible -> tDiffuse1
		fragmentShader += "	else if (color0.a >= epsilon && color1.a < epsilon)\n";
		fragmentShader += "	{\n";
		fragmentShader += "		color = color0;\n";
		if (_options.blendingMode === PS.Packet.BlendingMode.Feathering) {
			fragmentShader += "		color.a = 1.0;\n";
		}
		fragmentShader += "	}\n";

		//tDiffuse1 and tDiffuse2 are visible -> blending
		fragmentShader += "	else\n";
		fragmentShader += "	{\n";
		if (_options.blendingMode === PS.Packet.BlendingMode.Feathering) {
			fragmentShader += "		float weight = computeWeight(color0.a, color1.a);\n";
			fragmentShader += "		color = mix(color1, color0, weight);\n";
			fragmentShader += "		color.a = 1.0;\n";
		}
		else if (_options.blendingMode === PS.Packet.BlendingMode.DitheringLuminance) {
			fragmentShader += "		color.rgb = mix(color0.rgb, color1.rgb, prob);\n";
			fragmentShader += "		color.a = 1.0;\n";
		}
		else if (_options.blendingMode === PS.Packet.BlendingMode.DitheringColor) {
			fragmentShader += "		color.rgb = color1.rgb*probf + color0.rgb*nprobf;\n";
			fragmentShader += "		color.a = 1.0;\n";
		}
		else /*if (_options.blendingMode === PS.Packet.BlendingMode.Opacity)*/ {
			fragmentShader += "		color = mix(color1, color0, blendFactor);\n";
		}
		fragmentShader += "	}\n";

		fragmentShader += "	gl_FragColor = color;\n";
		fragmentShader += "}\n";

		return new PS.Packet.Shaders.Shader(uniforms, vertexShader, fragmentShader);
	}
};
