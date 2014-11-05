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

	PS.Progress:
	------------
	the purpose of this class is to display a horizontal bar on top of the screen to display some loading progress
	it's used by the UI/progressBar option in the 42 hidden menu

*/

PS.Progress = new function() {

	var _options = {
		color: "#19DB9F",
		initValue: 0,
		position: "top",
		thickness: 2
	};

	var _value;
	var _div;
	var _parentDiv;
	var _that = this;
	var _visible = false;
	var _initialized = false;

	this.init = function(options) {

		if (_initialized) {
			return _that.reset(options);
		}

		PS.extend(_options, options);

		_parentDiv = document.createElement("div");
		_parentDiv.style.position = "absolute";
		_parentDiv.style.width = "100%";
		_parentDiv.style.backgroundColor = "rgba(0, 0, 0, 0.3)";
		_parentDiv.style.display = "none";

		_div = document.createElement("div");
		_parentDiv.appendChild(_div);
		document.body.appendChild(_parentDiv);

		_that.reset(_options);

		_initialized = true;
	};

	this.reset = function(options) {
		PS.extend(_options, options);

		_parentDiv.style.display = "none";
		_parentDiv.style.height = _options.thickness+"px";
		_parentDiv.style.left = 0;
		if (_options.position === "bottom") {
			_parentDiv.style.bottom = 0;
			_parentDiv.style.top = "auto";
		}
		else {
			_parentDiv.style.bottom = "auto";
			_parentDiv.style.top = 0;
		}
		_div.style.backgroundColor = _options.color;
		_div.style.height = _options.thickness+"px";

		_that.set(_options.initValue);

		_visible = false;
	};

	this.set = function(percent) {

		if (!_initialized) {
			return;
		}

		_value = percent;
		_div.style.width = Math.round(percent*100)+"%";
		if (!_visible) {
			_parentDiv.style.display = "";
			_visible = true;
		}
	};

	this.done = function() {

		if (!_initialized) {
			return;
		}

		_parentDiv.style.display = "none";
		_visible = false;
	};
};
