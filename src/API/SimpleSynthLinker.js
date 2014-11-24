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

	PS.API.SimpleSynthLinker:
	-------------------------
	This class is a basic client to the experimental node.js synth linker computing a transform between 2 synths.
	The computed transform is used for the transition between 2 connected synths.
	The transform is store as a property of a regular annotation

*/

PS.API.SimpleSynthLinker = new function() {

	var _nodeUrl = "";
	var _that = this;

	var _errorMessage = "You need to initialize the SimpleSynthLinker to be able to use it!\nYou need to add PS.API.SimpleSynthLinker.init(_simpleSynthLinkerURL, _simpleSynthLinkerPort);";

	this.init = function(url, port, onInit) {

		if (url && port) {
			_nodeUrl = "http://" + url + ":" + port + "/";

			//test if the node service is running
			new PS.Utils.Request(_nodeUrl+"status", {
				onComplete: function(xhr) {
					console.log("Linker service running: " + xhr.responseText);
					if (onInit) {
						onInit(_that);
					}
				},
				onError: function() {
					console.warn("You need to run the fake node.js linker service");
					if (onInit) {
						onInit();
					}
				}
			});
		}
		else {
			console.warn(_errorMessage);
		}
	};

	this.create = function(request) {
		if (_nodeUrl) {
			new PS.Utils.Request(_nodeUrl+"requests", {
				method: 'POST',
				content: JSON.stringify(request),
				onComplete: function(xhr) {
					var json = JSON.parse(xhr.responseText);
					console.log(json);
				}
			});
		}
		else {
			console.warn(_errorMessage);
		}
	};
};
