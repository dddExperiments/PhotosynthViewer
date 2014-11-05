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

	PS.Packet.Annotation.VisibilityServiceFallback:
	-----------------------------------------------
	This class is responsible of providing visibility information for annotations
	-> when to show/hide an annotation while interacting with the viewer (user dragging)

	AnnotationVisibilityService is providing the same visibility information based on the point cloud
	This class is providing a fallback if we don't have a point cloud (in case of ps2 panorama in ice mode for example).
	The fallback is based on some basic heuristic:
	- 60deg visibility for closed spin and pano
	- 10% visibility for wall/walk and opened spin/pano

*/

PS.Packet.Annotation.VisibilityServiceFallback = function() {

	var _dataset;
	var _halfVisibleAngle = 30; //60deg visibility for closed spin and pano
	var _halfPercent      = 5;  //10% visibility for wall/walk and opened spin/pano

	this.init = function(dataset) {
		_dataset = dataset;
	};

	this.getVisibilityInformation = function(camSIndex) {

		var camQIndex  = _dataset.cameras[camSIndex].qIndex;
		var path       = _dataset.path;
		var pathLength = path.nbPoints;

		var halfDelta;
		if (_dataset.topology === "panorama" && path.isClosed) {
			//panorama we can display annotations for 180deg
			halfDelta = pathLength*0.25;
		}
		else if (_dataset.topology === "spin" && path.isClosed) {
			//spin we can use an angular representation as 1024 = 360deg
			halfDelta = _halfVisibleAngle*pathLength/360;
		}
		else {
			//display 5% path before + 5% path after or at least 3 cameras
			halfDelta = _halfPercent*pathLength/100;
		}

		var begin = path.fixRange(camQIndex-halfDelta);
		var end   = path.fixRange(camQIndex+halfDelta);

		var visibility = [];
		for (var i=0; i<_dataset.cameras.length; ++i) {
			var currentCamera = _dataset.cameras[i];
			var qIndex = currentCamera.qIndex;

			if (qIndex >= begin  && qIndex <= end && begin < end) { //common case
				visibility.push(currentCamera.index);
			}
			else if (begin > end) { //loop-closure case
				if (qIndex >= begin && qIndex <= pathLength-1) { // 800 - X --- 1023 - 0 ------- 200
					visibility.push(currentCamera.index);
				}
				else if (qIndex >= 0 && qIndex <= end) {         // 800 ------- 1023 - 0 -- X -- 200
					visibility.push(currentCamera.index);
				}
			}
		}

		//extend the visibility to 3 cameras in case it's only the current frame
		if (visibility.length === 1 || visibility.length === 0) { //0 shouldn't happen
			var nbCameras = _dataset.cameras.length;
			if (camSIndex === 0) {
				visibility.push(_dataset.cameras[1].index);
				visibility.push(_dataset.cameras[2].index);
			}
			else if (camSIndex === nbCameras-1) {
				visibility.push(_dataset.cameras[nbCameras-3].index);
				visibility.push(_dataset.cameras[nbCameras-2].index);
			}
			else {
				visibility.push(_dataset.cameras[camSIndex-1].index);
				visibility.push(_dataset.cameras[camSIndex+1].index);
			}
		}

		return visibility;
	};
};
