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

	PS.Annotation.VisibilityService:
	--------------------------------
	This class is responsible of providing visibility information for annotations
	-> when to show/hide an annotation while interacting with the viewer (user dragging)
	the visibility information are extracted from the point cloud by "bundling" the track visibility information of points close to the query point in image space

*/

PS.Packet.Annotation.VisibilityService = function() {

	var _pointClouds = [];

	this.init = function(packetRoot, nbPointCloudFiles) {

		//start downloading the point cloud
		var results = [];
		new PS.Utils.Async.Queue(PS.Utils.generateRangeArray(nbPointCloudFiles), {
			onProcess: function(item, callback) {
				var url = packetRoot+"/points/points_"+item+".bin";
				download(url, function(buffer) {
					results.push(parsePS1BinFile(buffer));
					callback();
				});
			},
			onComplete: function() {
				_pointClouds = results;
			}
		});
	};

	this.getFeatureVisibleInCamera = function(camIndex) {
		var points = [];
		var pcs = _pointClouds;
		for (var i=0; i<pcs.length; ++i) {
			var pc = pcs[i];
			for (var j=0; j<pc.viewList.length; ++j) {
				var viewList = pc.viewList[j];
				if (viewList.indexOf(camIndex) !== -1) {
					var x = pc.positions[j*3];
					var y = pc.positions[j*3+1];
					var z = pc.positions[j*3+2];
					points.push(x);
					points.push(y);
					points.push(z);
					points.push(i);
					points.push(j);
				}
			}
		}
		return points;
	};

	this.getVisibilityInformation = function(points) {
		var pcs = _pointClouds;
		var visibleCameras = {};
		for (var i=0; i<points.length; ++i) {

			var point      = points[i];
			var pcIndex    = point[0];
			var pointIndex = point[1];

			var viewList = pcs[pcIndex].viewList[pointIndex];
			for (var j=0; j<viewList.length; ++j) {
				visibleCameras[viewList[j]] = true;
			}
		}

		var cameraIds = [];
		for (var i in visibleCameras) {
			if (visibleCameras.hasOwnProperty(i)) {
				cameraIds.push(parseInt(i, 10));
			}
		}
		return cameraIds;
	};

	function download(url, onComplete) {
		new PS.Utils.Request(url, {
			responseType: "arraybuffer",
			onComplete: function(xhr) {
				onComplete(xhr.response);
			}
			/*TODO: do something on failure/error */
		});
	}

	//Store parsing result in Class instead of {} to make v8 happy
	function PointCloudParsingResult(nbTracks, nbVertices, positions, viewList) {
		this.nbTracks   = nbTracks; //nbTracks of length > 2
		this.nbVertices = nbVertices;
		this.positions  = positions;
		this.viewList   = viewList;
	}

	function parsePS1BinFile(data) {

		function ArrayReader(input) {
			var _view = new DataView(input);
			var _offset = 0;

			function getUint8() {
				return _view.getUint8(_offset++);
			}

			function getFloat32() {
				var value = _view.getFloat32(_offset, false); //big endian
				_offset+=4;
				return value;
			}

			this.ReadCompressedInt = function() {
				var i = 0;
				var b;
				do {
					b = getUint8();
					i = (i << 7) | (b & 127);
				} while (b < 128);

				return i;
			};

			this.ReadBigEndianSingle = function() {
				return getFloat32();
			};

			this.ReadBigEndianUInt16 = function() {
				var b0 = getUint8();
				var b1 = getUint8();

				return (b1 | b0 << 8);
			};
		}

		var input = new ArrayReader(data);
		var versionMajor  = input.ReadBigEndianUInt16();
		var versionMinor  = input.ReadBigEndianUInt16();

		if (versionMajor !== 1 || versionMinor !== 0) {
			return false;
		}

		var nbImages = input.ReadCompressedInt();

		var infos = [];
		for (var i=0; i<nbImages; ++i) {
			var nbInfo = input.ReadCompressedInt();
			for (var j=0; j<nbInfo; j++) {
				var vertexIndex = input.ReadCompressedInt();
				var range       = input.ReadCompressedInt();
				infos.push([i, vertexIndex, range]);
			}
		}

		var nbVertices = input.ReadCompressedInt();
		var vertsArray = new Float32Array(nbVertices * 3);
		var viewList   = new Array(nbVertices);

		for (var i=0; i<nbVertices; i++) {
			vertsArray[i*3+0] = input.ReadBigEndianSingle(); //x
			vertsArray[i*3+1] = input.ReadBigEndianSingle(); //y
			vertsArray[i*3+2] = input.ReadBigEndianSingle(); //z
			input.ReadBigEndianUInt16(); //color (rgb)
			viewList[i] = [];
		}

		for (var i=0; i<infos.length; ++i) {
			var info = infos[i]; //[pictureIndex, vertexIndex, range]
			for (var j=info[1]; j<info[1]+info[2]; ++j) {
				viewList[j].push(info[0]);
			}
		}

		var nbTracks = 0;
		for (var i=0; i<viewList.length; ++i) {
			if (viewList[i].length > 2) {
				nbTracks++;
			}
		}

		return new PointCloudParsingResult(nbTracks, nbVertices, vertsArray, viewList);
	}
};
