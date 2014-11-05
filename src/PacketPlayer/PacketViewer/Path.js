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

PS.Packet.RenderingPose = function(prevCamIndex, nextCamIndex, pose, percent, fov) {
	this.prevCamIndex = prevCamIndex;
	this.nextCamIndex = nextCamIndex;
	this.pose         = pose;
	this.percent      = percent;
	this.fov          = fov;
	this.speed        = 1.0;
};

PS.Packet.VirtualPath = function() {
	this.isActive  = false;
	this.range     = 3; //[-0.5, 0.5]*averageQIndexDistBetweenCameras around midQIndex
	this.midPose   = null;
	this.midQIndex = null;
	this.minQIndex = null;
	this.maxQIndex = null;
};

PS.Packet.Path = function(points, cameras, isClosed, topology, averageQIndexDistBetweenCameras, medianFov, globalDraggingDirection, options) {
	//cameras[] must be sorted by qIndex

	var _options = {
		extendPathEnabled:  true,
		smoothFovEnabled:   true,
		smoothSpeedEnabled: false,
		onEndpointProgress: function() {},
		onEndpointReached: function() {}
	};
	PS.extend(_options, options);

	this.setOptions = function(options) {
		PS.extend(_options, options);
	};

	this.topology = topology;
	this.isClosed = isClosed;
	this.points   = points;
	this.nbPoints = points.length;

	var _that = this;
	var _cameras  = cameras;
	var _averageQIndexDistBetweenCameras = averageQIndexDistBetweenCameras;
	var _temporaryVirtualPath = new PS.Packet.VirtualPath();
	var _persistentVirtualPath = new PS.Packet.VirtualPath();
	var _draggingDirection = 1.0;
	var _endpointFovIncrease = 5; //in degree

	var _startFovFactor = _endpointFovIncrease;
	var _endFovFactor   = _endpointFovIncrease;

	if (topology === "walk") {
		//the goal of this is to make fov increase at the end of the path and decrease at the start in order to create a 'pulling effect'
		if (globalDraggingDirection.y < 0) {
			_startFovFactor *= -1;
		}
		else {
			_endFovFactor *= -1;
		}
	}

	function smooth(attribute) {

		function posmod(n, k) {
			var n2 = n % k;
			return (n2 < 0 ? n2+k : n2);
		}

		var temp = new Array(_that.nbPoints);
		for (var i=0; i<_that.nbPoints; ++i) {
			temp[i] = 0;
		}
		var kradius = 100, ksize = 2*kradius+1;
		var ksigma = 2000;

		var kernel = new Array(ksize);
		var wsum = 0;
		for (var i=0; i<ksize; ++i) {
			kernel[i] = Math.exp(-(i-kradius)*(i-kradius)/ksigma);
			wsum += kernel[i];
		}

		if (_that.isClosed) {
			for (var i=0; i<ksize; ++i) {
				kernel[i] /= wsum;
			}
			for (var i=0; i<_that.nbPoints; ++i) {
				for (var j=0; j<ksize; ++j) {
					temp[i] += _that.points[posmod(i+j-kradius, _that.nbPoints)][attribute]*kernel[j];
				}
			}
		}
		else {
			for (var i=0; i<_that.nbPoints; ++i) {
				var currentkradius = Math.min(kradius, Math.min(i, _that.nbPoints-1-i));
				var currentksize = currentkradius*2 + 1;
				var kernelSum = 0;
				var kernelOffset = Math.floor((kradius-currentkradius)/2);
				for (var j=0; j<currentksize; ++j) {
					var kernelValue = kernel[j+kernelOffset];
					temp[i]   += _that.points[i+j-currentkradius][attribute]*kernelValue;
					kernelSum += kernelValue;
				}
				temp[i] /= kernelSum;
			}
		}
		for (var i=0; i<_that.nbPoints; ++i) {
			_that.points[i][attribute] = temp[i];
		}

	}

	function precomputeInfos(cameras, medianFov) {
		var firstCamQIndex = cameras[0].qIndex;
		var lastCamQIndex  = cameras[cameras.length-1].qIndex;

		var points = _that.points;
		for (var i=0; i<points.length; ++i) {

			//Explanation of the following comments:
			//  *    = quantized point
			//  c[i] = position of camera i
			// (*)   = current quantized point case
			// [...] = ellipsis

			var q = points[i];
			var previousCamIndex = 0;
			var nextCamIndex = 0;
			// (*) c[0] * * * [...]
			if (i < firstCamQIndex) {
				if (_that.isClosed) {
					previousCamIndex = cameras.length-1;
					nextCamIndex     = 0;
				}
				else { //opened
					previousCamIndex = -1;
					nextCamIndex     = 0;
					console.log("Error: malformed path");
				}
			}
			// [...] * * * * c[n-1] (*)
			else if (i > lastCamQIndex) {
				if (_that.isClosed) {
					previousCamIndex = cameras.length-1;
					nextCamIndex     = 0;
				}
				else { //opened
					previousCamIndex = cameras.length-1;
					nextCamIndex     = -1;
					console.log("Error: malformed path");
				}
			}
			// * c[0] * * * c[1] * (*) * [...] * * c[n-1] *
			else {
				previousCamIndex = 0;
				nextCamIndex     = 1;
				while (i < cameras[previousCamIndex].qIndex  || i > cameras[nextCamIndex].qIndex) {
					previousCamIndex++;
					nextCamIndex++;
				}
			}
			q.nextIndex = nextCamIndex;
			q.prevIndex = previousCamIndex;
		}

		if (_options.smoothFovEnabled) {

			//linear interpolation of fov
			if (!_that.isClosed) { //opened path
				for (var i=0; i<points.length; ++i) {
					var q = points[i];
					var prevCam = cameras[q.prevIndex];
					var nextCam = cameras[q.nextIndex];
					var percent = (i - prevCam.qIndex) / (nextCam.qIndex-prevCam.qIndex);
					q.fov = percent*nextCam.fovy + (1-percent)*prevCam.fovy;
				}
			}
			else { //closed path
				for (var i=0; i<points.length; ++i) {
					var q = points[i];
					var prevCam = cameras[q.prevIndex];
					var nextCam = cameras[q.nextIndex];

					var percent;
					if (prevCam.qIndex <= nextCam.qIndex) { //0 * * prev * * * i * * * next
						percent = (i - prevCam.qIndex) / (nextCam.qIndex-prevCam.qIndex);
					}
					else if (i > nextCam.qIndex) { //prev * * * i * * 0 * * * next
						percent = (i - prevCam.qIndex) / (nextCam.qIndex + _that.nbPoints - prevCam.qIndex);
					}
					else { //prev * * * 0 * * i * * * next
						percent = (i + _that.nbPoints - prevCam.qIndex) / (nextCam.qIndex + _that.nbPoints - prevCam.qIndex);
					}
					q.fov = percent*nextCam.fovy + (1-percent)*prevCam.fovy;
				}
			}

			smooth('fov');
		}
		else {
			for (var i=0; i<_that.nbPoints; ++i) {
				_that.points[i].fov = medianFov;
			}
		}

		if (_options.smoothSpeedEnabled) {

			//fill speed
			if (!_that.isClosed) { //opened path
				for (var i=0; i<points.length; ++i) {
					var q = points[i];
					var prevCam = cameras[q.prevIndex];
					var nextCam = cameras[q.nextIndex];
					var dist = nextCam.qIndex - prevCam.qIndex;
					q.speed = dist / _averageQIndexDistBetweenCameras;
				}
			}
			else { //closed path
				for (var i=0; i<points.length; ++i) {
					var q = points[i];
					var prevCam = cameras[q.prevIndex];
					var nextCam = cameras[q.nextIndex];

					var dist;
					if (prevCam.qIndex <= nextCam.qIndex) { //0 * * prev * * * i * * * next
						dist = nextCam.qIndex - prevCam.qIndex;
					}
					else { //prev * * * 0 * * * next
						dist = nextCam.qIndex + _that.nbPoints - prevCam.qIndex;
					}
					q.speed = _averageQIndexDistBetweenCameras / dist;
				}
			}

			smooth('speed');
		}
	}

	precomputeInfos(cameras, medianFov);

	this.getLocalSpeed = function(qIndex) {
		var index = _that.fixRange(qIndex);
		return _that.points[Math.floor(index)].speed;
	};

	this.distance = function(isClosed) {
		if (isClosed) {
			return function(startQIndex, stopQIndex) {
				if (startQIndex < stopQIndex) {
					return stopQIndex - startQIndex;
				}
				else {
					return (stopQIndex + _that.nbPoints - startQIndex) % _that.nbPoints;
				}
			};
		}
		else {
			return function(startQIndex, stopQIndex) {
				return Math.abs(stopQIndex - startQIndex);
			};
		}
	}(_that.isClosed);

	this.shortestDistance = function(isClosed) {
		if (isClosed) {
			return function(a, b) {
				var dist = _that.distance(a, b);
				if (dist > _that.nbPoints/2) {
					return _that.nbPoints - dist;
				}
				else {
					return dist;
				}
			};
		}
		else {
			return function(a, b) {
				return _that.distance(a, b);
			};
		}
	}(_that.isClosed);

	this.fixRange = function(isClosed) {
		if (isClosed) {
			//modulo in range [0, this.nbPoints[
			return function(index) {
				var nbPoints = this.nbPoints;
				var modIndex = index;
				while (modIndex < 0) {
					modIndex += nbPoints;
				}
				modIndex = modIndex % nbPoints;

				return modIndex;
			};
		}
		else {
			//clamp to range [0, this.nbPoints-1]
			return function(index) {
				if (index < 0) {
					return 0;
				}
				else if (index > this.nbPoints-1) {
					return this.nbPoints-1;
				}
				else {
					return index;
				}
			};
		}
	}(_that.isClosed);


	this.isInsideVirtualPath = function(isClosed) { //it doesn't matter if the boundary are included or not (but they are), tested with qIndex in the range
		if (isClosed) {
			//Closed version of this.isInsideVirtualPath(index)
			return function(qIndex, virtualPath) {

				virtualPath = (virtualPath) ? virtualPath : getCurrentVirtualPath();

				if (!virtualPath.isActive) {
					return false;
				}

				if (virtualPath.minQIndex < virtualPath.maxQIndex) { //normal case (0 ... min ... qIndex ... max)
					return qIndex >= virtualPath.minQIndex && qIndex <= virtualPath.maxQIndex;
				}
				else { //boundary case (min ... 0 ... qIndex ... max)
					return qIndex >= virtualPath.minQIndex || qIndex <= virtualPath.maxQIndex;
				}
			};
		}
		else {
			//Opened version of this.isInsideVirtualPath(index)
			return function(qIndex, virtualPath) {

				virtualPath = (virtualPath) ? virtualPath : getCurrentVirtualPath();

				if (!virtualPath.isActive) {
					return false;
				}

				return qIndex >= virtualPath.minQIndex && qIndex <= virtualPath.maxQIndex;
			};
		}
	}(_that.isClosed);

	function getDefaultPoseInsideVirtualPath(qIndex, virtualPath) {
		var src;
		var dst;
		var percent;

		if (qIndex > virtualPath.midQIndex) { //0 ... min ... mid ... qIndex ... max
			src = virtualPath.midPose;
			dst = _that.points[virtualPath.maxQIndex];
			if (virtualPath.maxQIndex === virtualPath.midQIndex) { //Can happen at the ends of the path
				percent = 1;
			}
			else {
				percent = (qIndex - virtualPath.midQIndex) / (virtualPath.maxQIndex - virtualPath.midQIndex);
			}
		}
		else { //0 ... min ... qIndex ... mid ... max
			src = _that.points[virtualPath.minQIndex];
			dst = virtualPath.midPose;
			if (virtualPath.midQIndex === virtualPath.minQIndex) { //Can happen at the ends of the path
				percent = 0;
			}
			else {
				percent = (qIndex - virtualPath.minQIndex) / (virtualPath.midQIndex - virtualPath.minQIndex);
			}
		}

		return _that.getLinearInterpolation(src, dst, percent);
	}

	this.getPoseInsideVirtualPath = function(isClosed) {
		if (isClosed) {
			//Closed version of this.getPoseInsideVirtualPath(index)
			return function(qIndex) {

				var virtualPath = getCurrentVirtualPath();

				if (virtualPath.minQIndex < virtualPath.maxQIndex) { //normal case (0 ... min ... qIndex ... max)
					return getDefaultPoseInsideVirtualPath(qIndex, virtualPath);
				}
				else { //boundary case
					if (virtualPath.midQIndex > virtualPath.minQIndex) { // min ... mid ... 0 ... max
						if (qIndex > virtualPath.minQIndex && qIndex <= virtualPath.midQIndex) { //min ... qIndex ... mid ... 0
							return getDefaultPoseInsideVirtualPath(qIndex, virtualPath);
						}
						else { //mid ... qIndex ... max
							var src = virtualPath.midPose;
							var dst = _that.points[virtualPath.maxQIndex];
							var percent;

							if (qIndex < virtualPath.minQIndex) { //mid ... 0 ... qIndex ... max
								percent = (qIndex + _that.nbPoints - virtualPath.midQIndex) / (virtualPath.maxQIndex + _that.nbPoints - virtualPath.midQIndex);
							}
							else { //mid ... qIndex ... 0 .. max
								percent = (qIndex - virtualPath.midQIndex) / (virtualPath.maxQIndex + _that.nbPoints - virtualPath.midQIndex);
							}

							return _that.getLinearInterpolation(src, dst, percent);
						}
					}
					else { //min ... 0 ... mid ... max
						if (qIndex > virtualPath.midQIndex && qIndex <= virtualPath.maxQIndex) { //0 ... mid ... qIndex ... max
							return getDefaultPoseInsideVirtualPath(qIndex, virtualPath);
						}
						else { //min ... qIndex ... mid
							var src = _that.points[virtualPath.minQIndex];
							var dst = virtualPath.midPose;
							var percent;

							if (qIndex > virtualPath.minQIndex) { //min ... qIndex ... 0 ... mid
								percent = (qIndex - virtualPath.minQIndex) / (virtualPath.midQIndex + _that.nbPoints - virtualPath.minQIndex);
							}
							else { //min ... 0 ... qIndex ... mid
								percent = (qIndex + _that.nbPoints - virtualPath.minQIndex) / (virtualPath.midQIndex + _that.nbPoints - virtualPath.minQIndex);
							}

							return _that.getLinearInterpolation(src, dst, percent);
						}
					}
				}
			};
		}
		else {
			//Opened version of this.getPoseInsideVirtualPath(index)
			return function (qIndex) {
				var virtualPath = getCurrentVirtualPath();

				return getDefaultPoseInsideVirtualPath(qIndex, virtualPath);
			};
		}
	}(_that.isClosed);

	function getCurrentVirtualPath() {
		if (_persistentVirtualPath.isActive) {
			return _persistentVirtualPath;
		}
		else {
			return _temporaryVirtualPath;
		}

	}

	function createVirtualPath(virtualPath, camera) {
		virtualPath.isActive = true;
		virtualPath.midQIndex = camera.qIndex;
		virtualPath.midPose = camera.pose;

		var radius = getVirtualPathRadius(virtualPath);
		virtualPath.minQIndex = _that.fixRange(Math.round(camera.qIndex - radius));
		virtualPath.maxQIndex = _that.fixRange(Math.round(camera.qIndex + radius));
	}

	function getVirtualPathRadius(virtualPath) {
		return _averageQIndexDistBetweenCameras * 0.5 * virtualPath.range;
	}

	this.getPersistentVirtualPathRadius = function () {
		return getVirtualPathRadius(_persistentVirtualPath);
	};

	this.createTemporaryVirtualPath = function (camera) {
		createVirtualPath(_temporaryVirtualPath, camera);
	};

	var _persistentVirtualPathNextCamera = null;

	this.createPersistentVirtualPath = function (camera, waitUntilCameraLeavesCurrentVirtualPath) {
		if (waitUntilCameraLeavesCurrentVirtualPath &&
			_persistentVirtualPath.isActive) {
			_persistentVirtualPathNextCamera = camera;
		}
		else {
			createVirtualPath(_persistentVirtualPath, camera);
		}
	};

	this.removePersistentVirtualPath = function () {
		_persistentVirtualPath.isActive = false;
	};

	this.makePersistentVirtualPathTemporary = function () {
		if (_persistentVirtualPath.isActive) {
			_temporaryVirtualPath.isActive = _persistentVirtualPath.isActive;
			_temporaryVirtualPath.range = _persistentVirtualPath.range;
			_temporaryVirtualPath.midQIndex = _persistentVirtualPath.midQIndex;
			_temporaryVirtualPath.midPose = _persistentVirtualPath.midPose;
			_temporaryVirtualPath.minQIndex = _persistentVirtualPath.minQIndex;
			_temporaryVirtualPath.maxQIndex = _persistentVirtualPath.maxQIndex;

			_persistentVirtualPath.isActive = false;
		}
	};

	this.getClosestCamera = function(isClosed) {
		//index is a float value that must range into [this.min, this.max]
		//it is returning the qIndex of the closest camera to index

		if (isClosed) {
			//Closed version of this.getClosestCamera(index)
			return function(index, respectDraggingDirection) {

				index = this.fixRange(index);

				var roundedIndex = this.fixRange(Math.round(index));
				var qPoint = this.points[roundedIndex];

				if (respectDraggingDirection) {
					var camIndex = (_draggingDirection < 0) ? qPoint.prevIndex : qPoint.nextIndex;
					return _cameras[camIndex];
				}
				else {
					var distPrev = 0;
					var distNext = 0;
					if (qPoint.prevIndex > qPoint.nextIndex) { //boundary case
						if (index > _cameras[qPoint.prevIndex].qIndex) {
							// [...] * * * * c[n-1] (*)
							distPrev = Math.abs(_cameras[qPoint.prevIndex].qIndex-index);
							distNext = Math.abs(_cameras[qPoint.nextIndex].qIndex+_that.nbPoints-index);
						}
						else { //if (index < _cameras[qPoint.nextIndex].qIndex) {
							// (*) c[0] * * * [...]
							distPrev = Math.abs(_cameras[qPoint.prevIndex].qIndex-_that.nbPoints-index);
							distNext = Math.abs(_cameras[qPoint.nextIndex].qIndex-index);
						}
					}
					else {
						// * c[0] * * * c[1] * (*) * [...] * * c[n-1] *
						distPrev = Math.abs(_cameras[qPoint.prevIndex].qIndex-index);
						distNext = Math.abs(_cameras[qPoint.nextIndex].qIndex-index);
					}
					var camIndex = (distPrev < distNext) ? qPoint.prevIndex : qPoint.nextIndex;

					return _cameras[camIndex];
				}
			};
		}
		else {
			//Opened version of this.getClosestCamera(index)
			return function(index, respectDraggingDirection) {

				index = this.fixRange(index);

				var roundedIndex = Math.round(index);
				var qPoint = this.points[roundedIndex];

				if (respectDraggingDirection) {
					var camIndex = (_draggingDirection < 0) ? qPoint.prevIndex : qPoint.nextIndex;
					return _cameras[camIndex];
				}
				else {
					if (qPoint.prevIndex === -1) {
						// (*) c[0] * * * [...]
						console.log("Error: malformed path");
						return _cameras[qPoint.nextIndex];
					}
					else if (qPoint.nextIndex === -1) {
						// [...] * * * * c[n-1] (*)
						console.log("Error: malformed path");
						return _cameras[qPoint.prevIndex];
					}
					else {
						// * c[0] * * * c[1] * (*) * [...] * * c[n-1] *
						var distPrev = Math.abs(_cameras[qPoint.prevIndex].qIndex-index);
						var distNext = Math.abs(_cameras[qPoint.nextIndex].qIndex-index);
						var camIndex = (distPrev < distNext) ? qPoint.prevIndex : qPoint.nextIndex;

						return _cameras[camIndex];
					}
				}
			};
		}
	}(_that.isClosed);

	var getSurroundingIndexes = function(isClosed) {
		if (isClosed) {
			//Closed version of getSurroundingIndexes(qIndex)
			return function(qIndex) {
				qIndex = _that.fixRange(qIndex);
				var roundedIndex = Math.round(qIndex);

				var delta = qIndex-roundedIndex;
				var otherIndex = (delta < 0) ? roundedIndex-1 : roundedIndex+1;
				var minIndex = Math.min(roundedIndex, otherIndex);
				var maxIndex = Math.max(roundedIndex, otherIndex);
				if (maxIndex === _that.nbPoints) {
					maxIndex = 0;
				}

				return [minIndex, maxIndex, qIndex, 0];
			};
		}
		else {
			//Opened version of getSurroundingIndexes(qIndex)
			return function(qIndex) {
				var previousQIndex = qIndex;
				qIndex = _that.fixRange(qIndex);

				var roundedIndex = Math.round(qIndex);

				var delta = qIndex-roundedIndex;
				var otherIndex = (delta < 0) ? roundedIndex-1 : roundedIndex+1;
				var minIndex = Math.min(roundedIndex, otherIndex);
				var maxIndex = Math.max(roundedIndex, otherIndex);
				if (minIndex === _that.points.length-1) {
					//[1023, 1024] -> [1022, 1023]
					//[-1,0] -> [0, 1] is not possible: if delta=0 we just create [roundedIndex, roundedIdex+1]
					maxIndex = minIndex;
					minIndex = minIndex-1;
				}

				var deltaOutsideOfPath = previousQIndex-qIndex;
				return [minIndex, maxIndex, qIndex, deltaOutsideOfPath];
			};
		}
	}(_that.isClosed);

	this.getPose = function(qIndex, mode) {

		//qIndex is a float value that must range into [this.min, this.max]
		//mode is an integer: 0 = smooth path, 1 = linear path
		var indexes = getSurroundingIndexes(qIndex);
		var renderingPose = getPose(indexes[0], indexes[1], indexes[2], mode, indexes[3]);

		if (_that.isClosed) { //seems to break the extendPath option for open path -> only apply for closed path
			qIndex = _that.fixRange(qIndex); //this need to be called after getSurroundingIndexes() (and not before) to detect dragging outside of path (at endpoint)
		}

		var virtualPath = getCurrentVirtualPath();

		if (virtualPath.isActive && mode === PS.Packet.CameraMode.Smooth) { //inside virtual path & mode = smooth
			if (_that.isInsideVirtualPath(qIndex)) { //inside virtual path
				renderingPose.pose = _that.getPoseInsideVirtualPath(qIndex);
			}
			else {
				//Off the current path
				if (virtualPath === _temporaryVirtualPath) {
					//if off the temporary virtual path, remove it
					virtualPath.isActive = false;
				}
				else if (_persistentVirtualPathNextCamera) {
					//if off the persistent virtual path and the next path has been passed in by the calling code, then switch to the next one.
					createVirtualPath(_persistentVirtualPath, _persistentVirtualPathNextCamera);
					_persistentVirtualPathNextCamera = null;
				}
			}
		}

		return renderingPose;
	};

	this.updateDraggingDirection = function(oldQIndex, newQIndex) {
		if (oldQIndex !== newQIndex) {
			_draggingDirection = newQIndex > oldQIndex ? 1 : -1;
		}
	};

	this.getDraggingDirection = function() {
		return _draggingDirection;
	};

	function getPose(minIndex, maxIndex, qIndex, mode, deltaOutsideOfPath) {

		var minQPose = _that.points[minIndex];
		var maxQPose = _that.points[maxIndex];

		var prevCamIndex = 0;
		var nextCamIndex = 0;

		if (minQPose.nextIndex === maxQPose.prevIndex) {
			//there is a camera between these 2 quantized points
			//example: cameraA minQ cameraB maxQ cameraC
			//minQ[A, B], maxQ[B, C] (quantizedPoint[prevIndex, nextIndex])

			if (minIndex > maxIndex) { //boundary case

				if (maxQPose.prevIndex === 0) { //-> _cameras[0].qIndex = 0
					prevCamIndex = minQPose.prevIndex;
					nextCamIndex = minQPose.nextIndex;
				}
				else {
					var midCameraQIndex = _cameras[minQPose.nextIndex].qIndex;
					if (qIndex > midCameraQIndex) {
						prevCamIndex = maxQPose.prevIndex;
						nextCamIndex = maxQPose.nextIndex;
					}
					else {
						prevCamIndex = minQPose.prevIndex;
						nextCamIndex = minQPose.nextIndex;
					}
				}
			}
			else { //normal case

				if (qIndex > _cameras[minQPose.nextIndex].qIndex) {
					prevCamIndex = maxQPose.prevIndex;
					nextCamIndex = maxQPose.nextIndex;
				}
				else {
					prevCamIndex = minQPose.prevIndex;
					nextCamIndex = minQPose.nextIndex;
				}
			}
		}
		else {
			//these 2 quantized points have the same surrounding cameras
			//example: cameraA q0 q1 cameraB
			//q0[A, B], q1[A, B] (quantizedPoint[prevIndex, nextIndex])
			prevCamIndex = minQPose.prevIndex;
			nextCamIndex = minQPose.nextIndex;
		}

		if (prevCamIndex === -1 || nextCamIndex === -1) {
			console.log("Error: malformed path");
			return;
		}

		var prevCam = _cameras[prevCamIndex];
		var nextCam = _cameras[nextCamIndex];
		var pose;
		var percent;
		var fov;

		if (deltaOutsideOfPath !== 0 && _options.extendPathEnabled) { //user dragging too much at the endpoints of the opened path

			var orientation;
			var position;
			var extendDist = _averageQIndexDistBetweenCameras; //*3;

			if (Math.abs(deltaOutsideOfPath) > extendDist) {
				deltaOutsideOfPath = extendDist * (deltaOutsideOfPath < 0 ? -1 : 1);
				_options.onEndpointReached(deltaOutsideOfPath < 0 ? -1 : 1);
			}
			else {
				_options.onEndpointProgress(deltaOutsideOfPath/extendDist);
			}

			if (deltaOutsideOfPath < 0) {
				orientation = minQPose.orientation.clone();
				position = minQPose.position.clone();
				percent = 0;
				var fovPercent = Math.abs(deltaOutsideOfPath/extendDist);
				fov = minQPose.fov + fovPercent*_startFovFactor;
			}
			else { //if (deltaOutsideOfPath > 0)
				orientation = maxQPose.orientation.clone();
				position = maxQPose.position.clone();
				percent = 1;
				var fovPercent = Math.abs(deltaOutsideOfPath/extendDist);
				fov = maxQPose.fov + fovPercent*_endFovFactor;
			}
			pose = new PS.Packet.Pose(position, orientation);
			return new PS.Packet.RenderingPose(prevCamIndex, nextCamIndex, pose, percent, fov);
		}

		//computing blending percent
		if (prevCam.qIndex < nextCam.qIndex) { //normal case
			percent = (qIndex-prevCam.qIndex)/(nextCam.qIndex-prevCam.qIndex);
		}
		else { //endpoint boundary case
			if (qIndex > prevCam.qIndex) { //prev ... qIndex ... 0 ... next
				percent = (qIndex - prevCam.qIndex) / (nextCam.qIndex + _that.nbPoints - prevCam.qIndex);
			}
			else { //prev ... 0 ... qIndex ... next
				percent = (qIndex + _that.nbPoints - prevCam.qIndex) / (nextCam.qIndex + _that.nbPoints - prevCam.qIndex);
			}
		}

		if (mode === PS.Packet.CameraMode.Smooth) {
			pose = _that.getLinearInterpolation(minQPose, maxQPose, qIndex-minIndex);
		}
		else if (mode === PS.Packet.CameraMode.Linear || mode === PS.Packet.CameraMode.Global) { //this function is called in global mode while animating to get prevCamIndex and nextCamIndex but not the pose
			pose = _that.getLinearInterpolation(prevCam.pose, nextCam.pose, percent);
		}
		else {
			console.log("Error: getPose() is called with a wrong mode");
		}
		fov = maxQPose.fov*(qIndex-minIndex) + minQPose.fov*(1-(qIndex-minIndex));
		return new PS.Packet.RenderingPose(prevCamIndex, nextCamIndex, pose, percent, fov);
	}
};

PS.Packet.Path.prototype.getLinearInterpolation = function (src, dst, percent) {
	var position = src.position.clone().multiplyScalar(1-percent).add(dst.position.clone().multiplyScalar(percent)); //src*(1-p) + dst*p
	var orientation = THREE.Quaternion.slerp(src.orientation, dst.orientation, new THREE.Quaternion(), percent);

	return new PS.Packet.Pose(position, orientation);
};

//returns the mean angle from up and the maximum difference from that mean (e.g., for computing roll)
PS.Packet.Path.prototype.getDirectionVariability = function(globalUp, localDir) {
	var minDot=0, maxDot=0, meanDot=0;
	for (var i=0; i<this.nbPoints; ++i) {
		var p = this.points[i];
		var globalDir = localDir.clone().applyQuaternion(p.orientation);

		var dot = globalDir.dot(globalUp);
		meanDot = meanDot + dot;
		if (i === 0 || dot < minDot) {
			minDot = dot;
		}
		if (i === 0 || dot > maxDot) {
			maxDot = dot;
		}
	}
	meanDot = meanDot/this.nbPoints;
	//_options.onLog({type:"Info", message:"dot range ("+minDot+", "+meanDot+", "+maxDot+")"});

	var minAngle = Math.acos(maxDot);
	var maxAngle = Math.acos(minDot);
	var meanAngle = Math.acos(meanDot);
	var variation = Math.max(maxAngle-meanAngle,meanAngle-minAngle);

	return [meanAngle, variation];
};

//returns the mean orientation and the maximum difference from that mean
PS.Packet.Path.prototype.getOrientationVariability = function() {
	//compute mean orientation
	var meanQVec = new THREE.Vector4(0,0,0,0);
	for (var i=0; i<this.nbPoints; ++i) {
		var o = this.points[i].orientation;
		var dot = meanQVec.x*o.x + meanQVec.y*o.y + meanQVec.z*o.z + meanQVec.w*o.w;
		meanQVec = (dot >= 0) ? meanQVec.add(o) : meanQVec.sub(o);
	}
	meanQVec.normalize();
	var meanQ = new THREE.Quaternion(meanQVec.x, meanQVec.y, meanQVec.z, meanQVec.w);

	//compute the maximum difference
	var maxTheta = 0;
	for (var i=0; i<this.nbPoints; ++i) {
		var o = this.points[i].orientation;
		var qDiff = o.clone().inverse().multiply(meanQ);
		var theta = 2*Math.acos(qDiff.w);
		if(theta > Math.PI) {
			theta = 2*Math.PI-theta;
		}
		maxTheta = Math.max(theta,maxTheta);
	}

	return [meanQ, maxTheta];
};

//apply orientation corrections for a spin
PS.Packet.Path.prototype.fixSpinOrientations = function(centerPoint, globalNormal, needSingleLookAt, needToRemoveRoll) {

	if (needSingleLookAt || needToRemoveRoll) {
		for (var i=0; i<this.nbPoints; ++i) {
			var p = this.points[i];

			var front, right, up;
			if (needSingleLookAt && needToRemoveRoll) {
				front = centerPoint.clone().sub(p.position).normalize();
				right = new THREE.Vector3().crossVectors(front, globalNormal).normalize();
				up    = new THREE.Vector3().crossVectors(right, front).normalize();
			}
			else if (needSingleLookAt && !needToRemoveRoll) {
				front        = centerPoint.clone().sub(p.position).normalize();
				var frontUnfixed = new THREE.Vector3(0, 0, -1).applyQuaternion(p.orientation);

				var angle = Math.acos(front.clone().normalize().dot(frontUnfixed.clone().normalize()));
				var fixedOrientation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3().crossVectors(frontUnfixed, front).normalize(), angle).multiply(p.orientation);

				right = new THREE.Vector3(1, 0, 0).applyQuaternion(fixedOrientation);
				up    = new THREE.Vector3(0, 1, 0).applyQuaternion(fixedOrientation);
			}
			else if (!needSingleLookAt && needToRemoveRoll) {
				front = new THREE.Vector3(0, 0, -1).applyQuaternion(p.orientation);
				right = new THREE.Vector3().crossVectors(front, globalNormal).normalize();
				up    = new THREE.Vector3().crossVectors(right, front).normalize();
			}

			var rotationMatrix = new THREE.Matrix4(right.x, up.x, -front.x, 0,
													right.y, up.y, -front.y, 0,
													right.z, up.z, -front.z, 0,
														0,    0,        0, 1);

			p.orientation.setFromRotationMatrix(rotationMatrix);
		}
	}
};

//apply orientation corrections for a wall or walk
PS.Packet.Path.prototype.fixWallWalkOrientations = function(globalUp, meanPitchAngle, meanRollAngle, needSinglePitch, needSingleRoll) {
	if(needSinglePitch || needSingleRoll) {
		for (var i=0; i<this.nbPoints; ++i) {
			var p = this.points[i];
			var front, right, up;

			//fix the pitch if needed
			front = new THREE.Vector3(0, 0, -1).applyQuaternion(p.orientation);
			right = new THREE.Vector3(1, 0, 0).applyQuaternion(p.orientation);
			if (needSinglePitch) {
				var currentPitch = Math.acos(front.dot(globalUp));
				var angleToMean = meanPitchAngle-currentPitch;
				var pitchFix = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3().crossVectors(front, globalUp).normalize(), -angleToMean);
				front = front.applyQuaternion(pitchFix);
				right = right.applyQuaternion(pitchFix);
			}

			//fix the roll if needed
			if(needSingleRoll) {
				var currentRoll = Math.acos(right.dot(globalUp));
				var angleToMean = meanRollAngle-currentRoll;
				var rollFix = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3().crossVectors(right, globalUp).normalize(), -angleToMean);
				front = front.applyQuaternion(rollFix);
				right = right.applyQuaternion(rollFix);
			}

			//construct the final rotation matrix
			up    = new THREE.Vector3().crossVectors(right, front).normalize();
			var rotationMatrix = new THREE.Matrix4(right.x, up.x, -front.x, 0,
													right.y, up.y, -front.y, 0,
													right.z, up.z, -front.z, 0,
															0,    0,        0, 1);

			p.orientation.setFromRotationMatrix(rotationMatrix);
		}
	}
};

//set all orientations identical (stronger version of fixWallWalkOrientations)
PS.Packet.Path.prototype.setAllOrientations = function(orientation) {
	for (var i=0; i<this.nbPoints; ++i) {
		var p = this.points[i];
		p.orientation = orientation.clone();
	}
};
