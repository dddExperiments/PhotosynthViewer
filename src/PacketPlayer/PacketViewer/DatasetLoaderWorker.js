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

PS.Packet.DatasetLoaderWorker = function(options) {

	var _options = {
		onPointCloudLoaded:   function() {},
		onGeometryCreated:    function() {},
		onGeometryFileLoaded: function() {},
		onLog: function() {},
		pathToWorker: "",
		tracksEnabled: false
	};
	PS.extend(_options, options);

	var _isIE = navigator.userAgent.indexOf("Trident") !== -1;

	var _worker;

	this.destroy = function() {
		if (_worker) {
			//TODO: postMessage with method: exit and then call self.close() from the web worker?
			//it's not clear if it's better
			_worker.terminate();
			_worker = null;
		}
	};

	this.postMessage = function() {
		if (_worker) {
			_worker.postMessage.apply(_worker, arguments);
		}
	};

	try {

		if (_options.pathToWorker === "") {
			_options.onLog({type: "Error", message: "you need to provide the path to the js worker for IE11"});
		}

		if (!PS.Packet.WorkerParser || _isIE) {
			//the debug viewer (ie: compiled=0) will trigger this condition (thanks to !PS.Packet.WorkerParser)
			//allowing us to debug the web worker more easily
			_worker = new Worker(_options.pathToWorker);
		}
		else {
			var blob = new Blob([PS.Packet.WorkerParser], {type: "application/javascript"});
			_worker = new Worker((URL || window.webkitURL).createObjectURL(blob));
		}
		_worker.onerror = function(err) {
			_options.onLog({type: "Error", message: err.message + " " + err.filename + "("+err.lineno+")"});
		};
		_worker.onmessage = function(evt) {

			if (evt.data.type === "log") {
				_options.onLog({type: "Error", message: evt.data.msg + " (geometry_"+evt.data.fileIndex+".bin)"});
			}
			else if (evt.data.type === "pointCloud") {

				var result = evt.data.result;
				//var pointCloudFileIndex = evt.data.index;

				var pointCloud = new THREE.BufferGeometry();
				pointCloud.attributes = {
					position: {
						itemSize: 3,
						array: result.positions
					},
					color: {
						itemSize: 3,
						array: result.colors
					}
				};

				var nbVertices = result.positions.length / 3;
				PS.Packet.WebGLMU.addBuffer(nbVertices*3*4*2); //3=xyz or rgb, 4=float, 2=position + rgb
				//_that.onGPUMemoryChange();

				_options.onPointCloudLoaded(evt.data.rootUrl, pointCloud, _options.tracksEnabled ? evt.data.result.viewList : []);
			}
			else if (evt.data.type === "geometry") {

				var nbCameras = evt.data.endCameraIndex-evt.data.startCameraIndex;
				var buffers = evt.data.result;
				var w, h;
				for (var i=0; i<nbCameras; ++i) {
					var indices  = buffers[i].indices;
					var vertices = buffers[i].vertices;
					var colors   = buffers[i].colors;
					w = buffers[i].width;
					h = buffers[i].height;
					var nbIndices  = indices.length;
					var nbVertices = vertices.length / 3;
					var geometry = new THREE.BufferGeometry();
					geometry.attributes = {
						index: {
							itemSize: 1,
							array: indices
						},
						position: {
							itemSize: 3,
							array: vertices
						}
					};
					if (_options.debugBlendingEnabled) {
						geometry.attributes.color = {
							itemSize: 3,
							array: colors
						};
					}
					geometry.offsets = [];
					var start = 0;
					while (nbIndices > 0) {
						var bufferSize = Math.min(nbIndices, 65535);
						geometry.offsets.push({
							'start': start,
							'count': bufferSize,
							'index': 0
						});
						nbIndices -= bufferSize;
						start += bufferSize;
					}
					var originalCameraIndex = evt.data.startCameraIndex+i;

					geometry.size = nbIndices*2+nbVertices*3*4 + _options.debugBlendingEnabled ? nbVertices*3*4 : 0;
					PS.Packet.WebGLMU.addBuffer(geometry.size);
					//_that.onGPUMemoryChange();

					_options.onGeometryCreated(evt.data.rootUrl, originalCameraIndex, geometry);
				}
				_options.onGeometryFileLoaded(evt.data.rootUrl);
			}
			else {
				_options.onLog({type: "Error", message: "Unknown web worker message type:" + evt.data.type});
			}
		};
	}
	catch(err) {
		_options.onLog({type: "Error", message: err});
	}
};
