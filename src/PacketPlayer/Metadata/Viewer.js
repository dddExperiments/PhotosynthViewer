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

	PS.Packet.Metadata.Viewer:
	--------------------------

	This class is displaying the toolbar with the play/pause buttons.
	It also contains the animated logo indicating that something is loading.

	Public Member:
	- progressIndicator;
		- this is the animated logo

*/

PS.Packet.Metadata = {};

PS.Packet.Metadata.Viewer = function(div, player, options) {

	var _that   = this;
	var _player = player;
	var _div    = div;

	var _options = {
		onTogglePlay: function() {},
		onToggleFullscreen: function() {},
		onZoomIn: function() {},
		onZoomOut: function() {},
		onZoomToHome: function() {},
		onToggle3D: function() {},
		onLogoClick: function() {},
		onAnnotate: function() {},
		onButtonClick: function() {},

		enableAnnotate:      false,
		enableGlobalView:    false,
		enableFullscreen:    true,
		enablePlayToggle:    true,
		enableLicense:       false,
		enableLogo:          true,
		enable3DToggle:      false,
		enableZoomToHome:    true,

		toolbarVisible:      true,
		toolbarBottomOffset: 10,
		toolbarPosition:     "center",
		progressPosition:    "center",
		logoURL:             "",
		logoTarget:          "_blank",
		width:               1280,
		height:              720
	};
	PS.extend(_options, options);

	var _annotateButton;
	var _playButton;
	var _fullscreenButton;

	var _cameraModeButton;
	var _zoomInButton;
	var _zoomOutButton;
	var _threeDButton;

	var _toolbarDiv;
	var _progressContainerDiv;
	var _progressValueDiv;
	var _progressPercentDiv;
	var _toolbarWidth = 191; //with only 3 icons
	var _zoomToHomeDiv;

	var _svg;

	this.destroy = function() {
		if (_that.progressIndicator) {
			_that.progressIndicator.destroy();
		}

		destroyButton(_svg,              onSVGClick);
		destroyButton(_annotateButton,   onAnnotateButtonClick);
		destroyButton(_playButton,       onPlayButtonClick);
		destroyButton(_fullscreenButton, onFullscreenButtonClick);
		destroyButton(_cameraModeButton, onCameraModeButtonClick);
		destroyButton(_zoomInButton,     onZoomOutButtonClick);
		destroyButton(_zoomOutButton,    onZoomInButtonClick);
		destroyButton(_threeDButton,     onThreeDButtonClick);

		if (_svg.getElementsByTagName("a").length > 0) {
			_svg.getElementsByTagName("a")[0].removeEventListener("click", onSVGClick);
		}

		if (_zoomToHomeDiv) {
			_zoomToHomeDiv.getElementsByTagName("button")[0].removeEventListener("click", onZoomToHomeButtonClick);
		}
	};

	function destroyButton(button, clickHandler) {
		if (button) {
			button.removeEventListener("click", clickHandler);
			removeCancelBubbleListener(button);
			button = null;
		}
	}

	this.setCameraMode = function(mode) {
		if (_options.enableGlobalView) {
			if (mode === PS.Packet.ViewMode.Global) {
				_zoomInButton.style.display = "inline";
				_zoomOutButton.style.display = "inline";
			}
			else {
				_zoomInButton.style.display = "none";
				_zoomOutButton.style.display = "none";
			}
		}
	};

	function cancelBubbleListener(e) {
		e.cancelBubble = true;
	}

	function addCancelBubbleListener(element) {

		//Bad hack for now to make sure the buttons of the toolbar are working
		//If I don't cancelbubbling then the events are captured by the PSInputLayer and not by the buttons

		element.addEventListener("mousedown",  cancelBubbleListener, false);
		element.addEventListener("touchstart", cancelBubbleListener, false);
		element.addEventListener("touchmove",  cancelBubbleListener, false);
		element.addEventListener("touchend",   cancelBubbleListener, false);

		element.addEventListener("MSPointerDown",   cancelBubbleListener, false);
		element.addEventListener("MSPointerUp",     cancelBubbleListener, false);
		element.addEventListener("MSGestureStart",  cancelBubbleListener, false);
		element.addEventListener("MSGestureChange", cancelBubbleListener, false);
		element.addEventListener("MSGestureEnd",    cancelBubbleListener, false);
	}

	function removeCancelBubbleListener(element) {
		element.removeEventListener("mousedown",  cancelBubbleListener);
		element.removeEventListener("touchstart", cancelBubbleListener);
		element.removeEventListener("touchmove",  cancelBubbleListener);
		element.removeEventListener("touchend",   cancelBubbleListener);

		element.removeEventListener("MSPointerDown",   cancelBubbleListener);
		element.removeEventListener("MSPointerUp",     cancelBubbleListener);
		element.removeEventListener("MSGestureStart",  cancelBubbleListener);
		element.removeEventListener("MSGestureChange", cancelBubbleListener);
		element.removeEventListener("MSGestureEnd",    cancelBubbleListener);
	}

	function onSVGClick(e) {
		_options.onLogoClick(e, _options.logoURL, _options.logoTarget);
		_options.onButtonClick();
	}

	function onAnnotateButtonClick() {
		_options.onAnnotate();
		_options.onButtonClick();
	}

	function onPlayButtonClick() {
		if (this.className === "play") {
			this.className = "pause";
		}
		else {
			this.className = "play";
		}
		_options.onTogglePlay(this.className === "play" ? "stopped" : "playing");
		_options.onButtonClick();
	}

	function onFullscreenButtonClick(e) {
		_options.onToggleFullscreen(e);
		_options.onButtonClick();
	}

	function onCameraModeButtonClick() {
		_player.toggleCameraMode();
		_options.onButtonClick();
	}

	function onZoomOutButtonClick(e) {
		_options.onZoomOut(e);
		_options.onButtonClick();
	}

	function onZoomInButtonClick(e) {
		_options.onZoomIn(e);
		_options.onButtonClick();
	}

	function onThreeDButtonClick() {
		if (this.className === "twod") {
			this.className = "threed";
		}
		else {
			this.className = "twod";
		}
		_options.onToggle3D(this.className === "twod" ? "3d" : "2d");
		_options.onButtonClick();
	}

	function onZoomToHomeButtonClick(e) {
		_zoomToHomeDiv.style.display = "none"; // hide as soon as button is clicked
		_player.seadragonViewer.goHome();
		_options.onZoomToHome(e);
		_options.onButtonClick();
	}

	function build() {
		var str = _that.generateLogoString(_options.enableLogo, _options.logoURL, _options.logoTarget);

		str += '<div class="license ccattrib" style="top: '+(_options.height-25)+'px; width: 16px; height: 16px;'+(!_options.enableLicense ? 'display: none;' : '')+'" title="This work is licensed to the public under the Creative Commons Attribution license."></div>';
		if (_options.title !== "") {
			_options.title += " ";
			str += '<p class="title" style="width: '+_options.title.length*8+'px">'+_options.title+'</p>';
		}

		if (_options.enableZoomToHome) {
			str += '<div class="zoomToHome" style="display: none;"><button /></div>';
		}

		var toolbarPositioning = _options.toolbarPosition === "right" ? 'right: 10px;' : 'left: '+(_options.width/2-_toolbarWidth/2)+'px;';
		str += '<div class="toolbar" style="bottom: '+_options.toolbarBottomOffset+'px; '+toolbarPositioning+'">';
		if (_options.enableAnnotate) {
			str += '	<button class="annotate" title="Add a new highlight"></button>';
		}
		str += '	<button class="pause" title="Play/Pause" style="'+(!_options.enablePlayToggle ? 'display: none;' : '')+'"></button>';
		if (_options.enableFullscreen) {
			str += '	<button class="fullscreen" title="Fullscreen"></button>';
		}
		if (_options.enableGlobalView) {
			str += '	<button class="cameraMode" title="Change camera mode"></button>';
			str += '	<button class="zoomOut" title="Zoom out" style="display: none;"></button>';
			str += '	<button class="zoomIn"  title="Zoom in"  style="display: none;"></button>';
		}
		if (_options.enable3DToggle) {
			str += '	<button class="twod" title="3D On/Off"></button>';
		}
		str += '</div>';
		var fontSize = Math.round(Math.min(_options.width, _options.height)*0.18);
		str += '<div class="progress-container" style="font-size: '+fontSize+'px; margin-top:'+(-Math.round(fontSize/2))+'px;"><div class="progress-value">00</div><div class="progress-percent" style="font-size: '+Math.round(fontSize*0.48)+'px; top:'+(-Math.round(fontSize*0.348))+'px">%</div></div>';

		_div.innerHTML += str;

		_toolbarDiv = _div.getElementsByClassName("toolbar")[0];
		_that.setToolbarVisibility(_options.toolbarVisible);
		_progressContainerDiv = _div.getElementsByClassName("progress-container")[0];
		_progressValueDiv     = _div.getElementsByClassName("progress-value")[0];
		_progressPercentDiv   = _div.getElementsByClassName("progress-percent")[0];

		_that.setProgressPercentVisibility(false);
		_that.resize(_options.width, _options.height);

		var buttons = _toolbarDiv.getElementsByTagName("button");
		buttons = Array.prototype.slice.call(buttons); //converting NodeList to Array

		//progress indicator
		_svg = _div.getElementsByTagName("svg")[0];
		_that.progressIndicator = new PS.Packet.Metadata.ProgressIndicator(_svg);
		addCancelBubbleListener(_svg);

		if (_options.logoURL !== "") {
			var a = _svg.getElementsByTagName("a")[0];
			a.addEventListener("click", onSVGClick, false);
		}

		var buttonIndex = 0;
		if (_options.enableAnnotate) {
			//annotate
			_annotateButton	 = buttons[buttonIndex++];
			_annotateButton.addEventListener("click", onAnnotateButtonClick, false);
			addCancelBubbleListener(_annotateButton);
		}

		//play/pause toggle
		_playButton = buttons[buttonIndex++];
		_playButton.addEventListener("click", onPlayButtonClick, false);
		addCancelBubbleListener(_playButton);

		if (_options.enableFullscreen) {
			//fullscreen
			_fullscreenButton = buttons[buttonIndex++];
			_fullscreenButton.addEventListener("click", onFullscreenButtonClick, false);
			addCancelBubbleListener(_fullscreenButton);
		}

		if (_options.enableGlobalView) {

			//cameraMode
			_cameraModeButton = buttons[buttonIndex++];
			_cameraModeButton.addEventListener("click", onCameraModeButtonClick, false);
			addCancelBubbleListener(_cameraModeButton);

			//zoomOut
			_zoomOutButton = buttons[buttonIndex++];
			_zoomOutButton.addEventListener("click", onZoomOutButtonClick, false);
			addCancelBubbleListener(_zoomOutButton);

			//zoomIn
			_zoomInButton = buttons[buttonIndex++];
			_zoomInButton.addEventListener("click", onZoomInButtonClick, false);
			addCancelBubbleListener(_zoomInButton);
		}

		if (_options.enable3DToggle) {
			_threeDButton = buttons[buttonIndex++];
			_threeDButton.addEventListener("click", onThreeDButtonClick, false);
			addCancelBubbleListener(_threeDButton);
		}

		if (_options.enableZoomToHome) {
			_zoomToHomeDiv = _div.getElementsByClassName("zoomToHome")[0];

			var zoomToHomeButton = _zoomToHomeDiv.getElementsByTagName("button")[0];
			zoomToHomeButton.addEventListener("click", onZoomToHomeButtonClick, false);
		}

	}

	this.setPlayButtonState = function(className) {
		_playButton.className = className;
	};

	this.getPlayButtonState = function() {
		return _playButton.className;
	};

	this.setFullscreenButtonState = function(className) {
		if (_options.enableFullscreen) {
			_fullscreenButton.className = className;

			if (_options.enableAnnotate) {
				_annotateButton.style.display = className === "exitFullscreen" ? "none" : "";
			}
		}
	};

	this.getFullscreenButtonState = function() {
		if (_options.enableFullscreen) {
			return _fullscreenButton.className;
		}
		else {
			//default to not in fullscreen
			return "fullscreen";
		}
	};

	this.setProgressPercentVisibility = function(visible) {
		_progressContainerDiv.style.visibility = visible ? "visible" : "hidden";
	};

	this.setProgressPercentText = function(text) {
		_progressValueDiv.innerHTML = text;
	};

	this.setToolbarVisibility = function(visible) {
		_toolbarDiv.style.display = visible ? "" : "none";
	};

	this.setToolbarBottomOffset = function(offset) {
		_toolbarDiv.style.bottom = offset + "px";
	};

	this.setToolbarPosition = function(mode) {
		_options.toolbarPosition = mode;
		_that.resize(_options.width, _options.height);
	};

	this.setProgressPercentPosition = function(mode) {
		_options.progressPosition = mode;
		_that.resize(_options.width, _options.height);
	};

	this.setZoomToHomeVisibility = function (isVisible) {
		_zoomToHomeDiv.style.display = isVisible ? "" : "none";
	};

	this.setSeadragonZoomState = function(isHomeZoom) {
		if (_zoomToHomeDiv) {
			_zoomToHomeDiv.style.display = isHomeZoom ? "none" : "";
		}
	};

	this.resize = function (width, height) {

		_options.width  = width;
		_options.height = height;

		var minDimension = Math.min(_options.width, _options.height);

		if (_options.progressPosition === "center") {
			var fontSize = Math.round(minDimension*0.18);
			_progressPercentDiv.style.fontSize = Math.round(fontSize*0.48) + "px";
			_progressPercentDiv.style.top = (-Math.round(fontSize*0.348))  + "px";

			_progressContainerDiv.style.fontSize  = fontSize + "px";
			_progressContainerDiv.style.marginTop = (-Math.round(fontSize/2)) + "px";

			var progressWidth = _progressValueDiv.clientWidth;
			_progressContainerDiv.style.left  = Math.round((width-progressWidth) / 2) + "px";
			_progressContainerDiv.style.right = "auto";

			_progressContainerDiv.style.top    = "50%";
			_progressContainerDiv.style.bottom = "auto";
		}
		else {
			var fontSize = Math.round(minDimension*0.1);
			_progressPercentDiv.style.fontSize = Math.round(fontSize*0.48) + "px";
			_progressPercentDiv.style.top = (-Math.round(fontSize*0.348))  + "px";

			_progressContainerDiv.style.fontSize  = fontSize + "px";
			_progressContainerDiv.style.marginTop = 0;

			_progressContainerDiv.style.left  = "auto";
			_progressContainerDiv.style.right = "25px";

			_progressContainerDiv.style.top    = "auto";
			_progressContainerDiv.style.bottom = "10px";
		}

		if (_options.toolbarPosition === "center") {
			_toolbarDiv.style.right = "auto";
			_toolbarDiv.style.left = ((width / 2) - _toolbarWidth/2) + "px";
		}
		else {
			_toolbarDiv.style.right = "10px";
			_toolbarDiv.style.left = "auto";
		}
	};

	build();
};

PS.Packet.Metadata.Viewer.prototype.generateLogoString = function(visible, logoURL, logoTarget) {

	var str = '';

	str += '<div class="progress-indicator" style="position: absolute; z-index: 5; top: 3px; left: 19px;'+(!visible ? 'display: none;' : '')+'">';
	str += '	<svg height="67" width="67" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns="http://www.w3.org/2000/svg">';
	str += '		<g transform="scale(0.8)">';
	str += '		<g transform="translate(12, 0)">';
	str += '			<circle cx="31" cy="31" r="17.75" stroke-opacity="1" style="stroke: #fff; stroke-width: 1.5px; fill: none;"></circle>';
	str += '			<circle cx="31" cy="31" r="17.75" stroke-opacity="1" style="stroke: #000; stroke-width:   4px; fill: none;" opacity="0.05" ></circle>';
	str += '		</g>';
	str += '		<g transform="translate(24, 12)">';
	str += '			<circle cx="31" cy="31" r="11.5" stroke-opacity="1" style="stroke: #fff; stroke-width: 1.5px; fill: none;"></circle>';
	str += '			<circle cx="31" cy="31" r="11.5" stroke-opacity="1" style="stroke: #000; stroke-width:   4px; fill: none;" opacity="0.05" ></circle>';
	str += '		</g>';
	str += '		<g transform="translate(12, 24)">';
	str += '			<circle cx="31" cy="31" r="30.25" stroke-opacity="0" style="stroke: #fff; stroke-width: 1.5px; fill: none;"></circle>';
	str += '			<circle cx="31" cy="31" r="30.25" stroke-opacity="0" style="stroke: #000; stroke-width:   4px; fill: none;" opacity="0.05" ></circle>';
	str += '		</g>';
	str += '		<g transform="translate(0, 12)">';
	str += '			<circle cx="31" cy="31" r="24" stroke-opacity="1" style="stroke: #fff; stroke-width: 1.5px; fill: none;"></circle>';
	str += '			<circle cx="31" cy="31" r="24" stroke-opacity="1" style="stroke: #000; stroke-width:   4px; fill: none;" opacity="0.05" ></circle>';
	str += '		</g>';
	str += '		</g>';

	if (logoURL !== "") {
		str+= '			<a xmlns="http://www.w3.org/2000/svg" xlink:href="'+logoURL+'" xmlns:xlink="http://www.w3.org/1999/xlink" target="'+logoTarget+'" style="cursor: pointer;">';
		str+= '				<rect x="0" y="0" width="100%" height="100%" fill-opacity="0"/>';
		str += '		</a>';
	}
	str += '	</svg>';
	str += '</div>';

	return str;
};
