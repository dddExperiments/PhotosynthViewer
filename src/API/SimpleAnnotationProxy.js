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

	PS.API.SimpleAnnotationProxy:
	-----------------------------
	This class is a basic read-only proxy for fetching annotations store on photosynth.net

*/

PS.API.SimpleAnnotationProxy = new function() {

	var _errorMessage = "This annotation storage is read-only";
	var _that = this;

	this.init = function(onInit) {
		if (onInit) {
			onInit(_that);
		}
	};

	this.load = function(guid, callback) {
		PS.API.getAnnotations(guid, callback);
	};

	this.insert = function(/*guid, annotation, thumbInfo, callback*/) {
		console.warn(_errorMessage);
	};

	this.update = function(/*guid, annotation, callback*/) {
		console.warn(_errorMessage);
	};

	this.remove = function(/*guid, annotation*/) {
		console.warn(_errorMessage);
	};
};
