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

PS.Packet.DatasetLoader = function(viewer, options) {

	var _options = {
		onViewerReady: function() {}
	};
	PS.extend(_options, options);

	var _isIE = navigator.userAgent.indexOf("Trident") !== -1;

	var _that = this;
	var _activeDataset;
	var _startLoading;
	var _viewer = viewer;

	this.destroy = function() {
		if (_worker) {
			_worker.destroy();
			_worker = null;
		}
	};

	var _workerOptions = PS.extend({}, options);
	_workerOptions.onPointCloudLoaded = function(rootUrl, pointCloud) {

		if (_activeDataset.rootUrl !== rootUrl) {
			//another dataset could have been requested, discard this callback
			pointCloud.dispose();
			pointCloud = null;
			return;
		}

		var particleSystem = new THREE.ParticleSystem(pointCloud, _activeDataset.pointCloudMaterial);
		particleSystem.visible = false;
		_activeDataset.particleSystems.push(particleSystem);

		_options.onPointCloudLoaded(particleSystem);

		if (_activeDataset.particleSystems.length === _activeDataset.nbPointCloudFiles) {
			_options.onLog({type: "Stats", label: "point cloud loaded", time: new Date()-_startLoading});
		}
	};
	_workerOptions.onGeometryCreated = function(rootUrl, originalCameraIndex, geometry) {

		if (_activeDataset.rootUrl !== rootUrl) {
			//another dataset could have been requested, discard this callback
			geometry.dispose();
			geometry = null;
			return;
		}

		var cameraIndex = _activeDataset.reverseCamIndex[originalCameraIndex];
		var camera      = _activeDataset.cameras[cameraIndex];
		camera.updateMesh(geometry, !_options.geometryEnabled);
	};
	_workerOptions.onGeometryFileLoaded = function(rootUrl) {

		if (_activeDataset.rootUrl !== rootUrl) {
			//another dataset could have been requested, discard this callback
			return;
		}

		_activeDataset.nbGeometryLoaded++;
		/*
		_that.onFinishDownloading(_that, {type: "geometry", index: evt.data.fileIndex, nbDownloaded: _nbGeometryLoaded, nbTotal: _geometryRanges.length, file: {
			width: w,
			height: h,
			parsingTime: evt.data.parsingTime,
			projectingTime: evt.data.projectingTime,
			totalTime: (new Date()-_startLoading)
		}});
		*/
		if (_activeDataset.nbGeometryLoaded === _activeDataset.geometryRanges.length) { //all geometry files are loaded

			//switch the thumbnail interpolation from nearest to linear
			for (var i=0; i<_activeDataset.atlases.length; ++i) {
				_activeDataset.atlases[i].minFilter = THREE.LinearFilter;
				_activeDataset.atlases[i].magFilter = THREE.LinearFilter;
				_activeDataset.atlases[i].needsUpdate = true;
			}
			_options.onLog({type: "Stats", time: (new Date()-_startLoading), label: "full geometry loaded"});
			_options.onAllGeometryLoaded();
		}
	};

	var _worker = new PS.Packet.DatasetLoaderWorker(_workerOptions);

	this.updateSlidingWindow = function(viewerState) {

		if (!_activeDataset.isRenderable) {
			return; //TODO: figure out why it's needed when loading a new dataset
		}

		_activeDataset.updateSlidingWindow(viewerState);

		if (_activeDataset.allGeometryWereDownloaded && !_activeDataset.allHDWereDownloadedOnce && _activeDataset.priorityDownloader) { //need to update download priority

			var startIndex = _activeDataset.path.getClosestCamera(viewerState.currentQIndex, true).sIndex;
			var downloadMode = "zigzag";

			var order = getDownloadOrder(_activeDataset.cameras.length, startIndex, _options.animateDirection, downloadMode);
			order.forEach(function(value, index) { //value = cam.sIndex, index = priority
				var cam = _activeDataset.cameras[value];
				if (!cam.wasDownloadedOnce) {
					_activeDataset.priorityDownloader.setPriority(cam.iIndex, index);
				}
			});
		}
	};

	this.load = function(url, options) {

		var opts = {
			startCameraIndex: -1
		};
		PS.extend(opts, options);

		//we can't check here if startCameraIndex is in a valid range
		//the actual check is done inside preload().
		_options.startCameraIndex = opts.startCameraIndex;

		_that.preload(url, function(dataset) {
			_that.setActive(dataset);
		});

	};

	this.setActive = function(dataset) {

		if (_activeDataset) {
			//_activeDataset.unload(_viewer.renderer);
			_viewer.unload();
			_viewer.onGPUMemoryChange();
		}

		_activeDataset = dataset;

		//create the webgl viewer, user can already interact at this stage
		_options.onViewerReady(dataset);

		//start loading the full geometry per camera + HD image
		loadGeometry(dataset);
	};

	this.preload = function(url, onPreloaded) {

		_startLoading = Date.now(); //TODO: remove this!

		var dataset = new PS.Packet.Dataset();
		dataset.startLoading = Date.now();
		dataset.rootUrl = url;

		_options.onLog({type: "Info", message: "Loading: " + dataset.rootUrl + "0.json"});

		//load 0.json and path.bin
		new PS.Utils.Async.parallel([
			function(callback) {
				new PS.Utils.Request(dataset.rootUrl + "0.json", {
					onComplete: function(xhr) {
						var result = JSON.parse(xhr.responseText);
						callback(null, result);
					},
					onError: function() {
						_options.onLog({type: "Error", message: "Fail to load: " + dataset.rootUrl + "0.json"});
						callback("Fail to load: " + dataset.rootUrl + "0.json", null);
					}
				});
			},
			function(callback) {
				new PS.Utils.Request(dataset.rootUrl + "path.bin", {
					responseType: 'arraybuffer',
					onComplete: function(xhr) {
						callback(null, xhr.response);
					},
					onError: function() {
						_options.onLog({type: "Error", message: "Fail to load: " + dataset.rootUrl + "path.bin"});
						callback("Fail to load: " + dataset.rootUrl + "path.bin", null);
					}
				});
			}
			], function(error, results) {
				if (error) {
					return;
				}
				else {
					var res = results;
					if (res[0] && res[1]) {

						//parsing 0.json
						var json = res[0];
						dataset.version = {};
						dataset.version.json     = json.json_version;
						dataset.version.geometry = json.geometry_version;
						dataset.version.path     = json.path_version;
						dataset.version.atlas    = json.atlas_version;
						dataset.version.image    = json.image_version;

						//image v1 = no seadragon, image v2 = seadragon
						if (dataset.version.image === 1) {
							dataset.imageSize.set(json.image_size[0], json.image_size[1]);
						}
						else {
							//using the one of the first image (doesn't need to use the dominant one as it's only used to compute the best LoD)
							dataset.imageSize.set(json.cameras[0].image_size[0], json.cameras[0].image_size[1]);
						}
						dataset.thumbSize.set(json.thumbnail_size[0], json.thumbnail_size[1]);

						var isClosedPath = json.is_closed === 1;
						var nbCameras = json.cameras.length;

						_options.onLog({type: "Info", message: nbCameras + " cameras found" });

						dataset.cameras = new Array(nbCameras);
						for (var i=0; i<nbCameras; ++i) {
							dataset.cameras[i] = new PS.Packet.Camera(json.cameras[i], i, _options.debugBlendingEnabled, _options.renderer.blendingMode === PS.Packet.BlendingMode.Feathering);
						}
						dataset.cameras.sort(function(a, b) { return a.qIndex - b.qIndex; }); //sorting camera by quantized index [0,1023]

						dataset.nbAtlases         = json.num_atlases;
						dataset.geometryRanges    = json.geometry_ranges;
						dataset.medianFov         = json.median_fov;
						dataset.medianAspectRatio = computeMedianAspectRatio(dataset);
						dataset.topology          = json.topology;
						dataset.dominantColors    = json.dominant_colors || [[0,0,0]];
						dataset.nbPointCloudFiles = json.num_point_files || 0;
						dataset.nbLevels          = json.pyramid_levels;

						dataset.medianCamera = {
							fovy: dataset.medianFov,
							fovx: 2*Math.atan(dataset.medianAspectRatio*Math.tan(dataset.medianFov*Math.PI/360))*180/Math.PI,
							aspectRatio: dataset.medianAspectRatio
						};

						//compute camera attributes (sIndex, prevCamera, nextCamera)
						computeCameraAttributes(dataset, isClosedPath);

						//compute cameras global property (average distance in QIndex and world, reverseIndex, near, far)
						computeCamerasGlobalProperty(dataset);

						//computing the global dragging direction
						computingGlobalDraggingDirection(dataset);

						//parsing path.bin
						var points = PS.Packet.Parsers.parsePathFile(res[1]);

						//Create the path
						//TODO: in the future, just pass dataset to the path constructor
						dataset.path = new PS.Packet.Path(points, dataset.cameras, isClosedPath, dataset.topology, dataset.averageQIndexDistBetweenCameras, dataset.medianFov, dataset.draggingDirection, {
							extendPathEnabled:  _options.extendPathEnabled,
							smoothFovEnabled:   _options.smoothFovEnabled,
							smoothSpeedEnabled: _options.smoothSpeedEnabled,
							onEndpointProgress: _options.onEndpointProgress,
							onEndpointReached:  _options.onEndpointReached
						});

						computeBestStartPosition(dataset);

						computeBestAnimationProperty(dataset);

						//improve path for spin and wall/walk
						improvePath(dataset, json);

						_options.onJsonParsed(json, dataset);

						//downloading atlases in parallel
						var atlasesDownloads = new Array(dataset.nbAtlases);

						//jshint loopfunc: true
						for (var i=0; i<dataset.nbAtlases; ++i) {
							//_that.onBeginDownloading(_that, {type: "atlas", index: i, nbDownloaded: dataset.nbAtlasesLoaded, nbTotal: dataset.nbAtlases});
							atlasesDownloads[i] = (function() {
								var index = i;
								return function(callback) {
									var src = dataset.rootUrl + (dataset.version.json === 2 ? "atlas/" : "") + 'atlas_' + index + '.jpg';
									new PS.Utils.ImageDownloader(src, callback, _options.corsEnabled);
								};
							})();
						}
						//jshint loopfunc: false

						new PS.Utils.Async.parallel(atlasesDownloads, function(err, results) {
							if (err) {
								console.log(err);
							}
							else {
								//creating one texture
								dataset.atlases = new Array(dataset.nbAtlases);
								for (var i=0; i<dataset.nbAtlases; ++i) {
									var tex = new THREE.Texture(results[i]);
									tex.needsUpdate = true; //Note: I'm not waiting for them to be uploaded -> I should use viewer.loadTexture calling renderer.uploadTexture
									tex.flipY = true;
									tex.minFilter = THREE.NearestFilter;
									tex.magFilter = THREE.NearestFilter;
									var img = tex.image;
									dataset.nbAtlasesLoaded++;
									//_that.onFinishDownloading(_that, {type: "atlas", img: img, index: i, nbDownloaded: _nbAtlasesLoaded, nbTotal: _nbAtlases});
									PS.Packet.WebGLMU.addTexture(img.width*img.height*3);
									//_that.onGPUMemoryChange();
									dataset.atlases[i] = tex;
								}

								//extracting thumbnail coords from atlases
								var atlasIndex = 0;
								dataset.lod = getBestLod(dataset);
								var memoryPerImage = dataset.renderingImageSize.x*dataset.renderingImageSize.y*3;
								dataset.nbSurroundingImage = Math.max(3,Math.round(_options.gpuHDMemoryBudget*1024*1024/(memoryPerImage)));
								_options.onLog({type: "Info", message: "Sliding window of " + dataset.nbSurroundingImage + " images -> " + Math.round(memoryPerImage*dataset.nbSurroundingImage/(1024*1024))+"mo"});
								var currentOffset  = 1;
								var thumbnailIndex = 0;
								dataset.thumbnails = new Array(nbCameras);
								for (var i=0; i<nbCameras; ++i) {
									if (currentOffset + dataset.thumbSize.x+1 >= 2048) {
										currentOffset=1;
										thumbnailIndex=0;
										atlasIndex++;
									}
									dataset.thumbnails[dataset.reverseCamIndex[i]] = new PS.Packet.Thumbnail(thumbnailIndex, atlasIndex, dataset.atlases[atlasIndex].image.width);
									thumbnailIndex++;
									currentOffset += dataset.thumbSize.x+1;
								}

								//create a dominant plane geometry per camera
								createDominantPlanesGeometry(dataset);

								//create axes, smooth and linear path, origin geometries for global view
								dataset.createGlobalViewGeometries();

								dataset.isRenderable = true;

								onPreloaded(dataset);
							}
						});

					}
				}
			}
		);
	};

	function computeCameraAttributes(dataset, isClosedPath) {

		var nbCameras = dataset.cameras.length;
		for (var i=0; i<nbCameras; ++i) {
			dataset.cameras[i].sIndex = i;
			if (i < nbCameras-1 || isClosedPath) {
				dataset.cameras[i].nextCamera = dataset.cameras[(i+1)%nbCameras];
			}
			if (i > 0 || isClosedPath) {
				dataset.cameras[i].prevCamera = dataset.cameras[(i>0)?i-1:nbCameras-1];
			}
		}
	}

	function computeCamerasGlobalProperty(dataset) {

		var nbCameras = dataset.cameras.length;

		//computing the average distance between cameras on the path
		dataset.averageQIndexDistBetweenCameras = 0;
		dataset.averageWorldDistBetweenCameras = 0;
		for (var i=1; i<nbCameras; ++i) {
			dataset.averageQIndexDistBetweenCameras += dataset.cameras[i].qIndex - dataset.cameras[i-1].qIndex;
			dataset.averageWorldDistBetweenCameras  += dataset.cameras[i].pose.position.clone().sub(dataset.cameras[i-1].pose.position).length();
		}
		dataset.averageQIndexDistBetweenCameras /= nbCameras-1;
		dataset.averageWorldDistBetweenCameras  /= nbCameras-1;

		//computing the reverse camera index mapping due to the qIndex sorting
		dataset.reverseCamIndex = new Array(nbCameras);
		for (var i=0; i<nbCameras; ++i) {
			dataset.reverseCamIndex[dataset.cameras[i].index] = i;
		}
		//computing the global near far
		var near = Number.POSITIVE_INFINITY;
		var far  = 0;
		for (var i=0; i<nbCameras; ++i) {
			near = Math.min(dataset.cameras[i].near, near);
			far  = Math.max(dataset.cameras[i].far, far);
		}
		near /= 4;
		far  *= 8;
		dataset.near = near;
		dataset.far  = far;

		_options.onLog({type: "Info", message: "Perspective camera -> near: " + near + ", far: " + far });
	}

	function computingGlobalDraggingDirection(dataset) {

		var nbCameras = dataset.cameras.length;

		//computing the global dragging direction
		var tangent           = new THREE.Vector3();
		var localDirectionSum = new THREE.Vector3();

		for (var i=1; i<nbCameras; ++i) {
			var currentOrientationInv = dataset.cameras[i].pose.orientation.clone().inverse();

			//tangent in world coordinates
			tangent.subVectors(dataset.cameras[i].pose.position, dataset.cameras[i-1].pose.position).normalize();

			//tangent in local camera coordinates
			tangent.applyQuaternion(currentOrientationInv);

			localDirectionSum.add(tangent);
		}

		if (dataset.topology === "walk") {
			dataset.draggingDirection.set(0, localDirectionSum.z < 0 ? 1 : -1);
			dataset.draggingDirectionCSSClass = "Vertical";
		}
		else {
			if (Math.abs(localDirectionSum.x) > Math.abs(localDirectionSum.y)) {
				dataset.draggingDirection.set(localDirectionSum.x < 0 ? 1 : -1, 0);
				dataset.draggingDirectionCSSClass = "Horizontal";
			}
			else {
				dataset.draggingDirection.set(0, localDirectionSum.y < 0 ? -1 : 1);
				dataset.draggingDirectionCSSClass = "Vertical";
			}
		}
		_options.onLog({type: "Info", message: "Dragging direction: ("+dataset.draggingDirection.x+","+dataset.draggingDirection.y+")" });
	}

	function computeMedianAspectRatio(dataset) {

		var nbCameras = dataset.cameras.length;

		var aspects = new Array(nbCameras);
		for (var i=0; i<nbCameras; ++i) {
			aspects[i] = dataset.cameras[i].aspectRatio;
		}
		aspects.sort(function(a, b){ return a-b; });

		return aspects[Math.floor(nbCameras/2)];
	}

	function computeBestStartPosition(dataset) {

		//update startTransitionPercent as we have now the topology from the json
		if (_options.startTransitionPercent === -1) {
			if (dataset.topology === "spin" || dataset.topology === "panorama") {
				dataset.startTransitionPercent = 0.5;
			}
			else {
				dataset.startTransitionPercent = 0;
			}
		}
		else {
			dataset.startTransitionPercent = _options.startTransitionPercent;
		}

		//override the default starting location if the startCameraIndex is provided
		if (_options.startCameraIndex !== -1) {

			if (_options.startCameraIndex >= 0 && _options.startCameraIndex < dataset.cameras.length) {
				var startCamera = dataset.cameras[_options.startCameraIndex];
				_options.startTransitionPercent = startCamera.qIndex / (dataset.path.nbPoints-1);
				_options.onLog({type: "Info", message: "Start camera index: " + _options.startCameraIndex});
			}
			else {
				_options.onLog({type: "Error", message: "Out of range startCameraIndex: " + _options.startCameraIndex + " >= " + dataset.cameras.length});
				_options.onLog({type: "Info", message: "Start transition percent: " + dataset.startTransitionPercent});
			}
		}
		else {
			_options.onLog({type: "Info", message: "Start transition percent: " + dataset.startTransitionPercent});
		}

		dataset.startingCamera = dataset.path.getClosestCamera(_options.startTransitionPercent*dataset.path.nbPoints, false);
	}

	function computeBestAnimationProperty(dataset) {

		//computing a better animation speed for wall and walk
		if (dataset.topology === "wall" || dataset.topology === "walk") {
			dataset.animateSpeed *= dataset.averageQIndexDistBetweenCameras * _options.wallWalkFramePerSecond * 16.667 / 1000;
		}
		else if (dataset.topology === "spin" || dataset.topology === "panorama") {
			dataset.animateSpeed *= (1024*16.667) / (_options.timeForFullRotation*1000);

			//adjusting the speed of spin and panorama
			var cameraPerSecond = (dataset.cameras.length/(_options.timeForFullRotation*dataset.path.nbPoints/1024));
			var threshold = dataset.topology === "spin" ? _options.maxSpinFramePerSecond : _options.maxPanoFramePerSecond;
			if (cameraPerSecond > threshold) {
				dataset.animateSpeed *= threshold / cameraPerSecond;
			}
		}

		_options.onLog({type: "Info", message: "Animation duration: " + Math.round(dataset.path.nbPoints*16.667*10/(dataset.animateSpeed*1000))/10 + "s"});
	}

	function improvePath(dataset, json) {

		//detecting if we should use a single look-at point while dragging and also if we should remove roll
		if (dataset.topology === "spin" && json.center_point && _options.pathFixingEnabled) {
			var centerPoint = new THREE.Vector3(json.center_point[0], json.center_point[1], json.center_point[2]);
			var upVector = new THREE.Vector3(0, 0, 1);
			var globalNormalNeedFlipping = dataset.cameras[0].cameraUp.dot(upVector) < 0;
			var globalNormal = globalNormalNeedFlipping ? upVector.clone().negate() : upVector.clone();

			var needSingleLookAt = false;
			var needToRemoveRoll = false;

			var maxFrontAngle = 0; //used to determine if we need to use a single look at
			var maxRightAngle = 0; //used to determine if we need a single up vector (remove roll)
			for (var i=0; i<dataset.path.nbPoints; ++i) {
				var p = dataset.path.points[i];
				var singleLookAt = centerPoint.clone().sub(p.position).normalize();
				var front = new THREE.Vector3(0, 0, -1).applyQuaternion(p.orientation);
				var right = new THREE.Vector3(1, 0,  0).applyQuaternion(p.orientation);
				var rightWithoutRoll = new THREE.Vector3().crossVectors(front, globalNormal).normalize();

				var currentFrontAngle = Math.acos(front.dot(singleLookAt))*180/Math.PI;
				if (currentFrontAngle > maxFrontAngle) {
					maxFrontAngle = currentFrontAngle;
				}

				var currentRightAngle = Math.acos(right.dot(rightWithoutRoll))*180/Math.PI;
				if (currentRightAngle > maxRightAngle) {
					maxRightAngle = currentRightAngle;
				}
			}
			if (maxFrontAngle < _options.singleLookAtThreshold) {
				needSingleLookAt = true;
			}
			if (maxRightAngle < _options.cameraRollThreshold) {
				needToRemoveRoll = true;
			}
			//console.log("max angle LookAt("+maxFrontAngle+" -> "+needSingleLookAt+"), Up("+maxRightAngle+" -> "+needToRemoveRoll+")");
			dataset.path.fixSpinOrientations(centerPoint, globalNormal, needSingleLookAt, needToRemoveRoll);
		}

		//detecting if we should fix particular rotation components for a wall/walk
		// pitch component refers to dot product of front vector with some global UP
		// roll component refers to dot product of right vector with some global UP
		else if ((dataset.topology === "wall" || dataset.topology === "walk") && _options.pathFixingEnabled) {

			//start by seeing if a single shared orientation will work
			var orientationResult = dataset.path.getOrientationVariability();
			var needSharedOrientation =  orientationResult[1]*180/Math.PI < _options.sharedOrientationThreshold;
			_options.onLog({type: "Info", message:"Orientation variation "+orientationResult[1]*180/Math.PI+" -> "+needSharedOrientation});

			if (needSharedOrientation) {
				dataset.path.setAllOrientations(orientationResult[0]);
			}
			else {
				//try components separately
				var globalUp   = new THREE.Vector3(0,0,1);
				var localFront = new THREE.Vector3(0,0,-1);
				var localRight = new THREE.Vector3(1,0,0);

				//estimate how much the roll and pitch vary
				var pitchResult = dataset.path.getDirectionVariability(globalUp,localFront);
				var rollResult  = dataset.path.getDirectionVariability(globalUp,localRight);

				//decide which to fix
				var needSinglePitch =  pitchResult[1]* 180/Math.PI < _options.wallWalkPitchThreshold;
				var needSingleRoll  =  rollResult[1] * 180/Math.PI < _options.wallWalkRollThreshold;

				_options.onLog({type: "Info", message: "Pitch variation "+pitchResult[1]*180/Math.PI+" -> "+needSinglePitch});
				_options.onLog({type: "Info", message: "Roll variation "  +rollResult[1]*180/Math.PI+" -> "+needSingleRoll});

				//fix it
				dataset.path.fixWallWalkOrientations(globalUp, pitchResult[0], rollResult[0], needSinglePitch, needSingleRoll);
			}
		}
	}

	function getBestLod(dataset) {
		dataset.renderingImageSize = dataset.imageSize.clone();

		var counter = 0;
		while (dataset.renderingImageSize.x*dataset.renderingImageSize.y > _options.maxHDPixels && counter < dataset.nbLevels-1) {
			dataset.renderingImageSize.x = Math.floor((dataset.renderingImageSize.x)/2);
			dataset.renderingImageSize.y = Math.floor((dataset.renderingImageSize.y)/2);
			counter++;
		}

		_options.onLog({type: "Info", message: "Choosing LoD " + counter + " ("+dataset.renderingImageSize.x+"x"+dataset.renderingImageSize.y+")"});

		return counter;
	}

	function createDominantPlanesGeometry(dataset) {

		var nbCameras = dataset.cameras.length;

		//create the simplified geometry for each camera (using dominant planes)
		for (var i=0; i<nbCameras; ++i) {
			var thumbnail = dataset.thumbnails[i];
			var atlas = dataset.atlases[thumbnail.atlasIndex];
			dataset.cameras[i].updateLowMaterial(thumbnail, atlas, dataset.thumbSize);
		}
		_options.onLog({type: "Stats", label: "dominant plane geometry", time: Date.now()-_startLoading});
	}

	function getDownloadOrder(nbItems, start, direction, mode) {
		var items = [];

		if (mode === "zigzag") {

			//zigzag around the start
			for (var i=0; i<2*nbItems; ++i) {
				var zigzag = (i >> 1) ^ (-(i & 1)); // 0 -1  1 -2  2 -3  3 ...
				var current = start+zigzag;
				if (current <nbItems && current >=0) {
					items.push(current);
				}
			}

		}
		else { //if mode === contiguous
			if (direction === -1) {
				//start -> 0
				for (var i=start; i>=0; --i) {
					items.push(i);
				}
				//start+1 -> end
				for (var i=start+1; i<nbItems; ++i) {
					items.push(i);
				}
			}
			else if (direction === 1) {
				//start -> end
				for (var i=start; i<nbItems; ++i) {
					items.push(i);
				}
				//start-1 -> 0
				for (var i=start-1; i>=0; --i) {
					items.push(i);
				}
			}
		}
		return items;
	}

	function loadGeometry(dataset) {

		var nbCameras = dataset.cameras.length;

		var imageOrder    = getDownloadOrder(nbCameras, dataset.startingCamera.sIndex, _options.animateDirection, "contiguous").slice(0, _options.downloadConcurrency);
		var geometryOrder = PS.Utils.generateRangeArray(dataset.geometryRanges.length); //TODO: download geometry using a zigzag pattern?

		var requests = imageOrder.map(function(v) { return {type: "image", index: v}; });
		requests = requests.concat(geometryOrder.map(function(v) { return {type: "geometry", index: v}; }));

		dataset.preDownloadedImages = imageOrder;

		var nbItemDownloaded = 0;
		_options.onProgressPercentChange(0.0);
		new PS.Utils.Async.Queue(requests, {
			concurrency: _options.downloadConcurrency,
			onProcess: function(item, callback) {

				var fileIndex = item.index;
				if (item.type === "image") {

					var url = dataset.getImageUrl(dataset.cameras[fileIndex].iIndex);
					dataset.cameras[fileIndex].loadTexture(url,
						function() {
							dataset.cameras[fileIndex].isSelected = true;
							nbItemDownloaded++;
							_options.onProgressPercentChange(nbItemDownloaded/requests.length);
							callback();
						},
						function(texture) {
							dataset.cameras[fileIndex].updateHighMaterial(texture);
						}
					);
				}
				else { //item.type === "geometry"
					//_that.onBeginDownloading(_that, {type: "geometry", index: fileIndex, nbDownloaded: _nbGeometryLoaded, nbTotal: _geometryRanges.length});
					var range = dataset.computeRange(fileIndex);
					new PS.Utils.Request(dataset.getGeometryUrl(fileIndex), {
						responseType: "arraybuffer",
						onComplete: function(xhr) {

							nbItemDownloaded++;
							_options.onProgressPercentChange(nbItemDownloaded/requests.length);

							var arr = _isIE ? [] : [xhr.response];
							_worker.postMessage({
								"type": "createGeometry",
								"cameras": dataset.createSubCamerasList(range.start, range.end),
								"buffer": xhr.response,
								"startCameraIndex": range.start,
								"endCameraIndex": range.end,
								"fileIndex": fileIndex,
								"debugBlendingEnabled": _options.debugBlendingEnabled,
								"rootUrl": dataset.rootUrl
							}, arr);

							callback();
						},
						onError: function() {
							_options.onLog({type: "Error", message: "Fail to load: " + dataset.getGeometryUrl(fileIndex)});
							callback();
						}
					});
				}
			},
			onComplete: function() {
				dataset.allGeometryWereDownloaded = true;
				_options.onProgressPercentChange(1.0);
				_options.onAllGeometryDownloaded();
				_options.onLog({type: "Stats", label: "full geometry downloaded", time: new Date()-_startLoading});

				if (_options.progressBarEnabled) {
					PS.Progress.init();
				}

				var viewerState = _options.getViewerState();

				var userHasAlreadyInteracted = viewerState.hasUserAlreadyInteracted();
				var startIndex   = dataset.startingCamera.sIndex;
				var downloadMode = "contiguous";

				if (userHasAlreadyInteracted) {
					var currentClosestCamera = dataset.path.getClosestCamera(viewerState.currentQIndex, false);
					startIndex = currentClosestCamera.sIndex;
					downloadMode = "zigzag";

					var currentPose = viewerState.currentPose;

					//if the viewer is resting on a camera, load the corresponding seadragon
					if (currentPose.position.equals(currentClosestCamera.pose.position) && currentPose.orientation.equals(currentClosestCamera.pose.orientation)) {
						_options.startDownloadingTiles(currentClosestCamera, true);
					}
				}

				var order = getDownloadOrder(dataset.cameras.length, startIndex, _options.animateDirection, downloadMode);
				if (!userHasAlreadyInteracted) {
					order = order.slice(_options.downloadConcurrency); //they were already downloaded
				}

				var items = order.map(function(value, index) { //value = cam.sIndex, index = priority
					var cam = dataset.cameras[value];
					return new PS.Utils.Async.PriorityItem(cam.iIndex, value, index); //cam.iIndex = key
				});

				dataset.priorityDownloader = new PS.Utils.Async.PriorityQueue(items, {
					concurrency: _options.downloadConcurrency,
					onProcess: function(item, callback) { //item.value = cam.sIndex
						var camera = dataset.cameras[item.value];
						var url = dataset.getImageUrl(camera.iIndex);
						camera.loadTexture(url,
							function() {//on img downloaded
								var nbCamerasDownloaded = dataset.cameras.reduce(function(previousValue, camera) {
									return previousValue + (camera.wasDownloadedOnce ? 1 : 0);
								}, 0);
								if (_options.progressBarEnabled) {
									PS.Progress.set(nbCamerasDownloaded / dataset.cameras.length);
								}
								//camera.isSelected = true;
								_that.updateSlidingWindow(_options.getViewerState());   //this will set isSelected to true and thus upload this texture to GPU
																						//if that camera is in the sliding window
								callback();
							},
							function() { //on img uploaded to GPU
								//camera.updateHighMaterial(texture);
							}
						);
					},
					onComplete: function() {
						dataset.allHDWereDownloadedOnce = true;
						_options.onAllHDLoaded();
						_options.onLog({type: "Stats", label: "all HD", time: new Date()-_startLoading});

						if (_options.progressBarEnabled) {
							setTimeout(function() {
								PS.Progress.done();
							}, 150);
						}

						if (_options.pointCloudEnabled) {
							startDownloadingPointCloud(dataset);
						}

					}
				});
			}
		});
	}

	function startDownloadingPointCloud(dataset) {

		var nbFiles = dataset.nbPointCloudFiles;
		_options.onLog({type: "Info", message: nbFiles + " PS1 point cloud files"});


		//_pointPositions = new Array(dataset.nbPointCloudFiles);
		//TODO: send the list of camera matrix so that I can project the 3d point to their correspondant cameras in the web worker.

		new PS.Utils.Async.Queue(PS.Utils.generateRangeArray(dataset.nbPointCloudFiles), {
			concurrency: _options.downloadConcurrency,
			onProcess: function(index, callback) {

				//_that.onBeginDownloading();
				new PS.Utils.Request(dataset.getPointCloudUrl(index), {
					responseType: "arraybuffer",
					onComplete: function(xhr) {

						//_that.onFinishDownloading();
						var arr = _isIE ? [] : [xhr.response];
						_worker.postMessage({
							"type": "createPointCloud",
							"index": index,
							"buffer": xhr.response,
							"rootUrl": dataset.rootUrl
						}, arr);

						callback();
					},
					onError: function() {
						_options.onLog({type: "Error", message: "Fail to load: " + dataset.getPointCloudUrl(index)});
						callback();
					}
				});
			},
			onComplete: function() {
				_options.onLog({type: "Stats", label: "point cloud downloaded", time: new Date()-_startLoading});
			}
		});
	}
};
