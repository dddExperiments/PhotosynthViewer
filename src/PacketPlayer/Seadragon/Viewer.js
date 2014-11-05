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

	PS.Packet.Seadragon.Viewer:
	---------------------------

	This class is the seadragon viewer used to display HD imagery at rest.
	It's a wrapper on top of OpenSeadragon.
	Openseadragon user inputs are provided by the MultiViewerCameraController

	Public Methods:
	- windowToImageCoordinates(x,y)
	- fitBoundsWithConstraints(bounds, immediately)
	- goHome()
	- isHomeZoom()

*/

PS.Packet.Seadragon = {};

PS.Packet.Seadragon.generateUniqueHash = (function() {
	var counter = 0;
	return function() {
		return "seadragon_"+(counter++);
	};
})();

PS.Packet.Seadragon.TileSource = function(dimensions, tileSize) {
	this.dimensions = dimensions.clone();
	this.maxLevel   = Math.ceil(Math.log(Math.max(dimensions.x, dimensions.y)) / Math.log(2));
	this.tileSize   = tileSize || 510;
};

PS.Packet.Seadragon.TileSource.prototype = {

	//From OpenSeadragon

	getLevelScale: function(level) {
		var levelScaleCache = {};
		for (var i=0; i <= this.maxLevel; i++) {
			levelScaleCache[i] = 1 / Math.pow(2, this.maxLevel - i);
		}
		this.getLevelScale = function(_level){
			return levelScaleCache[_level];
		};
		return this.getLevelScale(level);
	},

	getLevelSize: function(level) {
		var scale = this.getLevelScale(level),
			x = Math.ceil(scale * this.dimensions.x),
			y = Math.ceil(scale * this.dimensions.y);

		return new THREE.Vector2(x, y);
	},

	getNumTiles: function(level) {
		var scale = this.getLevelScale(level),
			x = Math.ceil(scale * this.dimensions.x / this.tileSize),
			y = Math.ceil(scale * this.dimensions.y / this.tileSize);

		return new THREE.Vector2(x, y);
	},

	getNbTiles: function(level) {
		var tiles = this.getNumTiles(level);

		return tiles.x * tiles.y;
	}
};

PS.Packet.Seadragon.Viewer = function(div, inputDiv) {

	var _that = this;
	var _viewer;
	var _viewerDiv = div;
	var _inputDiv = inputDiv;
	var _that = this;
	var _isVisible = false;
	var _isForceVisible = true;
	var _isInitialized = false;
	var _offsetX = 0;
	var _offsetY = 0;
	var _cropping;
	var _animationCallback;
	var _isHomeZoom = true;
	var _onOpened = function() {};

	var _options = {
		renderingSize:           new THREE.Vector2(0, 0),
		onPositionChanged:       function() {},
		onResize:                function() {},
		onZoomLevelStateChanged: function() {},
		corsEnabled:             false
	};

	this.init = function(options) {
		PS.extend(_options, options);
	};

	this.destroy = function() {
		if (_viewer) {
			_viewer.removeAllHandlers("open");
			_viewer.removeAllHandlers("resize");
			_viewer.removeAllHandlers("home");
			_viewer.removeAllHandlers("animation-finish");
			_viewer.removeAllHandlers("anination");
			_viewer.destroy();
			_viewer = null;
		}
		_that.openSeadreagon = null;
	};

	this.enable = function() {
		_isInitialized = true;
	};

	this.disable = function() {
		_isInitialized = false;
	};

	this.setVisible = function(visible) {
		if (_isVisible !== visible) {
			if (_isInitialized || !_isInitialized && !visible) {
				if (_isForceVisible) {
					//console.log("setVisible("+visible+")");
					_viewerDiv.style.visibility = visible ? "visible" : "hidden";
				}
				_isVisible = visible;
			}
		}
	};

	this.setForceVisible = function(visible) {
		if (visible) {
			_viewerDiv.style.visibility = _isVisible ? "visible" : "hidden";
		}
		else {
			_viewerDiv.style.visibility = "hidden";
		}
		_isForceVisible = visible;
	};

	this.isVisible = function() {
		return _isVisible;
	};

	this.isHomeZoom = function() {
		var epsilon = 0.001;

		if (_viewer && _viewer.viewport) {
			return (Math.abs(_viewer.viewport.getZoom(true) - _viewer.viewport.getHomeZoom()) < epsilon);
		}
		else {
			return false;
		}
	};

	this.goHome = function() {
		if (_viewer && _viewer.viewport) {
			_viewer.viewport.goHome();
		}
	};

	this.getViewportRect = function () {
		return {
			left: _viewerDiv.offsetLeft,
			top: _viewerDiv.offsetTop,
			width: _viewerDiv.clientWidth,
			height: _viewerDiv.clientHeight
		};
	};

	function adjustForCropping() {
		//position/resize container to match the cropping

		//For some reason, IE11 has a bug that causes offsetWidth/Height and getBoundingClientRect to report vastly smaller values than the truth
		//when going fullscreen from inside an iframe.  Ex, clientWidth will correctly report 1680 but offsetWidth will report 17.
		//They seem to be off by a factor of 100.  So we must use clientWidth here.
		var containerWidth  = _inputDiv.clientWidth;
		var containerHeight = _inputDiv.clientHeight;

		var croppingAspect  = _cropping.w / _cropping.h;
		var containerAspect = containerWidth / containerHeight;
		var scale = (containerAspect > croppingAspect) ? _cropping.h / containerHeight : _cropping.w / containerWidth;

		//If we need to scale the imagery up, then make the viewport larger than the viewer container here.
		//If we need to scale the imagery down, then leave the viewport the same size as the container and set homeBounds appropriately below when loading.
		//The reason for this dual approach is that both approaches have issues if used exclusively:
		//- If the homebounds are made larger than the viewport, then zooming back does not center the imagery.
		//- If the viewport is made smaller, then when the user zooms in, there will be blank regions inside the container but outside the viewport.
		if (scale < 1) {
			scale = 1;
		}

		var width  = containerWidth * scale;
		var height = containerHeight * scale;
		_offsetX   = (containerWidth - width)   / 2;
		_offsetY   = (containerHeight - height) / 2;

		_viewerDiv.style.left = _offsetX + "px";
		_viewerDiv.style.top  = _offsetY + "px";
		_viewerDiv.style.width  = width  + "px";
		_viewerDiv.style.height = height + "px";
	}

	this.getOffset = function () {
		return {
			x: _offsetX,
			y: _offsetY
		};
	};

	this.setCropping = function (cropping) {
		_cropping = cropping;
		adjustForCropping();
	};

	this.startLoading = function(baseURL, size, cropping, onOpened) {
		_onOpened = onOpened || function() {};
		_cropping = cropping;
		adjustForCropping();

		_that.setVisible(false);

		if (!_viewer && _isInitialized) {
			build(baseURL, size);
		}
		else if (_isInitialized) {
			_viewer.open({
				Image: {
					xmlns:    "http://schemas.microsoft.com/deepzoom/2008",
					Url:      baseURL,
					Format:   "jpg",
					Overlap:  "1",
					TileSize: "510",
					Size: {
						Width:  size.x,
						Height: size.y
					}
				},
				minLevel: findBestMinLevel(size)
			});
		}

		return _isInitialized;
	};

	this.setAnimationCallback = function (animationCallback) {
		_animationCallback = animationCallback;
	};

	this.windowToImageCoordinates = function(x, y) {
		var viewport = _viewer.viewport;

		var aspectX = viewport.contentAspectX;
		viewport.contentAspectX = viewport.contentSize.x / viewport.contentSize.y; //magic :) (needed for the case where we mess up with the contentAspectX)
		var point = viewport.windowToImageCoordinates(new OpenSeadragon.Point(x, y));
		viewport.contentAspectX = aspectX;

		return new THREE.Vector2(point.x, point.y);
	};

	this.fitBoundsWithConstraints = function(bounds, immediately) {

		if (_viewer.viewport.fitBoundsWithConstraints) {
			return _viewer.viewport.fitBoundsWithConstraints(bounds, immediately);
		}

		var that = _viewer.viewport;

		var aspect = that.getAspectRatio(),
			center = bounds.getCenter(),
			newBounds = new OpenSeadragon.Rect(
				bounds.x,
				bounds.y,
				bounds.width,
				bounds.height
			),
			oldBounds,
			oldZoom,
			newZoom,
			referencePoint,
			horizontalThreshold,
			verticalThreshold,
			left,
			right,
			top,
			bottom,
			dx = 0,
			dy = 0,
			newBoundsAspectRatio;

		if ( newBounds.getAspectRatio() >= aspect ) {
			newBounds.height = bounds.width / aspect;
			newBounds.y      = center.y - newBounds.height / 2;
		} else {
			newBounds.width = bounds.height * aspect;
			newBounds.x     = center.x - newBounds.width / 2;
		}

		newBoundsAspectRatio = newBounds.getAspectRatio();

		that.panTo( that.getCenter( true ), true );
		that.zoomTo( that.getZoom( true ), null, true );

		oldBounds = that.getBounds();
		oldZoom   = that.getZoom();
		newZoom   = 1.0 / newBounds.width;

		var newConstrainedZoom = Math.max(
			Math.min(newZoom, that.getMaxZoom() ),
			that.getMinZoom()
		);

		if (newZoom !== newConstrainedZoom) {
			newZoom = newConstrainedZoom;
			newBounds.width = 1.0 / newZoom;
			newBounds.x = center.x - newBounds.width / 2;
			newBounds.height = newBounds.width / newBoundsAspectRatio;
			newBounds.y = center.y - newBounds.height / 2;
		}

		horizontalThreshold = that.visibilityRatio * newBounds.width;
		verticalThreshold   = that.visibilityRatio * newBounds.height;

		left   = newBounds.x + newBounds.width;
		right  = 1 - newBounds.x;
		top    = newBounds.y + newBounds.height;
		bottom = that.contentAspectY - newBounds.y;

		if ( that.wrapHorizontal ) {
			//do nothing
		} else {
			if ( left < horizontalThreshold ) {
				dx = horizontalThreshold - left;
			}
			if ( right < horizontalThreshold ) {
				dx = dx ?
					( dx + right - horizontalThreshold ) / 2 :
					( right - horizontalThreshold );
			}
		}

		if ( that.wrapVertical ) {
			//do nothing
		} else {
			if ( top < verticalThreshold ) {
				dy = ( verticalThreshold - top );
			}
			if ( bottom < verticalThreshold ) {
				dy =  dy ?
					( dy + bottom - verticalThreshold ) / 2 :
					( bottom - verticalThreshold );
			}
		}

		if ( dx || dy ) {
			newBounds.x += dx;
			newBounds.y += dy;
			if( newBounds.width > 1  ){
				newBounds.x = 0.5 - newBounds.width/2;
			}
			if( newBounds.height > that.contentAspectY ){
				newBounds.y = that.contentAspectY/2 - newBounds.height/2;
			}
		}

		if ( newZoom === oldZoom || newBounds.width === oldBounds.width ) {
			return that.panTo( newBounds.getCenter(), immediately );
		}

		referencePoint = oldBounds.getTopLeft().times(
			that.containerSize.x / oldBounds.width
		).minus(
			newBounds.getTopLeft().times(
				that.containerSize.x / newBounds.width
			)
		).divide(
			that.containerSize.x / oldBounds.width -
			that.containerSize.x / newBounds.width
		);

		return that.zoomTo( newZoom, referencePoint, immediately );
	};

	function findBestMinLevel(size) {
		var w = size.x;
		var h = size.y;
		var maxLevel  = Math.ceil(Math.log(Math.max(w, h)) / Math.log(2));
		var bestLevel = maxLevel;
		while (w > _options.renderingSize.x || h > _options.renderingSize.y) {
			w /= 2;
			h /= 2;
			bestLevel--;
		}
		return Math.min(Math.max(bestLevel, 0), maxLevel);
	}

	function build(baseURL, size) {
		/* jshint newcap: false */
		_viewer = OpenSeadragon({
			element: _viewerDiv,
			showNavigationControl: false,
			springStiffness: 20,
			animationTime : 1.5,
			visibilityRatio: 1,
			hash: PS.Packet.Seadragon.generateUniqueHash(),
			//crossOriginPolicy: _options.corsEnabled ? 'Anonymous' : false,
			tileSources: {
				Image: {
					xmlns:    "http://schemas.microsoft.com/deepzoom/2008",
					Url:      baseURL,
					Format:   "jpg",
					Overlap:  1,
					TileSize: 510,
					Size: {
						Width:  size.x,
						Height: size.y
					}
				},
				minLevel: findBestMinLevel(size)
			}
		});
		/* jshint newcap: true */

		_viewer.addHandler("open", function () {

			_onOpened();

			//compute bounds according to cropping information

			var containerWidth = _inputDiv.clientWidth;
			var containerHeight = _inputDiv.clientHeight;

			var croppingAspect = _cropping.w / _cropping.h;
			var containerAspect = containerWidth / containerHeight;

			var scale = (containerAspect > croppingAspect) ? _cropping.h / containerHeight : _cropping.w / containerWidth;

			//If we need to scale the imagery up, then make the viewport larger than the viewer container above when adjusting for cropping.
			//If we need to scale the imagery down, then leave the viewport the same size as the container and set homeBounds appropriately here.
			//The reason for this dual approach is that both approaches have issues if used exclusively:
			//- If the homebounds are made larger than the viewport, then zooming back does not center the imagery.
			//- If the viewport is made smaller, then when the user zooms in, there will be blank regions inside the container but outside the viewport.
			if (scale < 1) {
				var currentBounds = _viewer.viewport.getBounds(true);
				var centerPoint = currentBounds.getCenter();
				var newWidth  = currentBounds.width / scale;
				var newHeight = currentBounds.height / scale;
				var newBounds = new OpenSeadragon.Rect(
					centerPoint.x - (newWidth / 2),
					centerPoint.y - (newHeight / 2),
					newWidth,
					newHeight
				);

				_viewer.viewport.fitBounds(newBounds, true);

				//modify home bounds so that goHome() will go to the cropping region
				_viewer.viewport.originalHomeBounds = _viewer.viewport.homeBounds;
				_viewer.viewport.homeBounds = newBounds;
				_viewer.viewport.contentAspectX = _viewer.viewport.getAspectRatio() * _viewer.viewport.getZoom(); //magic :)
			}
			else {
				_viewer.viewport.originalHomeBounds = _viewer.viewport.homeBounds;
			}

			_viewer.viewport.goHome(true);
		});

		_viewer.addHandler("resize", function () {
			adjustForCropping();
			_viewer.viewport.goHome(true);
			_options.onResize();
		});

		_viewer.addHandler("home", function() {
			_inputDiv.style.visibility = "visible";
		});

		_viewer.addHandler("animation-finish", function() {
			_options.onZoomLevelStateChanged(_that.isHomeZoom());
		});

		_viewer.addHandler("animation", function(e) {
			_options.onPositionChanged();

			var isHomeZoom = _that.isHomeZoom();
			if (_isHomeZoom !== isHomeZoom) {
				_isHomeZoom = isHomeZoom;
				_options.onZoomLevelStateChanged(isHomeZoom);
			}

			if (_animationCallback) {
				_animationCallback(e);
			}
		});

		_viewerDiv.style.position = "absolute"; //It seems that OpenSeadragon is changing this to relative...
		_that.openSeadragon = _viewer;
	}
};
