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

	PS.API.SimpleStaticStorage:
	---------------------------
	This class is a basic client providing a read-only annotation storage feature based on a single json.
	This json file can be generated from a dump of the AnnotationStorage using the download button of the debug graph viewer

*/

PS.API.SimpleStaticStorage = new function() {

	var _synths = {};
	var _that = this;

	this.init = function(url, onInit) {
		//Parse and store in memory the json with the virtual tour
		new PS.Utils.Request(url, {
			onComplete: function(xhr) {
				var synths = JSON.parse(xhr.responseText);
				if (synths.length > 0) {
					synths.forEach(function(s) {
						_synths[s.guid] = s.annotations;
					});
				}
				if (onInit) {
					onInit(_that);
				}
			},
			onError: function() {
				if (onInit) {
					onInit();
				}
			}
		});
	};

	this.load = function(guid, callback) {
		//TODO: implement this with queueing
		//IE: load calls need to be queue until init is done
		var annotations = _synths[guid];
		callback(annotations || []);
	};

	this.insert = function(/*guid, annotation, thumbInfo, callback*/) {
		console.warn("Insert is not supported by the SimpleStaticStorage");
	};

	this.update = function(/*guid, annotation, callback*/) {
		console.warn("Update is not supported by the SimpleStaticStorage");
	};

	this.remove = function(/*guid, annotation*/) {
		console.warn("Remove is not supported by the SimpleStaticStorage");
	};
};
