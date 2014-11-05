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

	Core:
	-----
	- PS namespace definition
	- PS.Packet namespace definition

	- PS.isWebGLEnabled()
	- PS.extend()
	- PS.extractGuid()

*/

//jshint -W079
var PS = PS || {};
//jshint +W079

PS.Packet = {};

PS.isWebGLEnabled = function() {
	try {
		var canvas = document.createElement("canvas");
		return !!window.WebGLRenderingContext && (canvas.getContext("experimental-webgl") || canvas.getContext("webgl"));
	}
	catch(e) {
		return false;
	}
};

PS.extend = function(target, source, options) {

	var _options = {
		deep:  options && options.deep  === false ? false : true,
		merge: options && options.merge === false ? false : true
	};

	for (var i in source) {
		if (source.hasOwnProperty(i)) {
			if (typeof source[i] === "object" && typeof target[i] === "object" && _options.deep && _options.merge) {
				PS.extend(target[i], source[i]);
			}
			else if (typeof source[i] === "object" && _options.deep) {
				target[i] = PS.extend(Array.isArray(source[i]) ? [] : {}, source[i]);
			}
			else {
				target[i] = source[i];
			}
		}
	}
	return target;
};

PS.extractGuid = function(url) {
	//This will extract the guid from the root url of a synth packet (sorry about that)
	//https://cdn.photosynth.net/ps2/11a0c938-ea81-47c2-a140-65cba367d169/packet/  ->  11a0c938-ea81-47c2-a140-65cba367d169
	url = url.replace("/packet/", "");
	url = url.replace("http://cdn.photosynth.net/ps2/", "");
	url = url.replace("https://cdn.photosynth.net/ps2/", "");

	return url;
};
