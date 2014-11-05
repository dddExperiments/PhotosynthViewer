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

	PS.Packet.Metadata.ProgressIndicator:
	-------------------------------------

	This class contain the animated pulsating logo used to show the loading status of the viewer.

	Public Methods:
	- setPercent(percent)
		 - percent = Number [0,100]
	- start()
	- stop()
	- setVisible(visible)
		- visible = boolean

*/

PS.Packet.Metadata.ProgressIndicator = function(svg) {

	var _svg = svg;
	var _circles = _svg.getElementsByTagName("circle");
	var _logoCircle1 = _circles[0];
	var _logoCircle2 = _circles[2];
	var _logoCircle3 = _circles[4];
	var _logoCircle4 = _circles[6];

	var _logoCircle1bis = _circles[1];
	var _logoCircle2bis = _circles[3];
	var _logoCircle3bis = _circles[5];
	var _logoCircle4bis = _circles[7];

	var _introAnimation = true;
	var _outroAnimation = false;
	var _logoPlaying    = false;
	var _ticks = 0;
	var _timer;
	var _that = this;
	var _requestAnimFrameId;

	this.destroy = function() {
		_that.stop();
		clearInterval(_timer);
		if (_requestAnimFrameId) {
			cancelAnimationFrame(_requestAnimFrameId);
			_requestAnimFrameId = null;
		}
	};

	function animateLogo() {

		if (_logoPlaying || _ticks !== 32) {
			transformCircle(_logoCircle1, _ticks);
			transformCircle(_logoCircle4, (_ticks + 25) % 100);
			transformCircle(_logoCircle3, (_ticks + 50) % 100);
			transformCircle(_logoCircle2, (_ticks + 75) % 100);

			transformCircle(_logoCircle1bis, _ticks);
			transformCircle(_logoCircle4bis, (_ticks + 25) % 100);
			transformCircle(_logoCircle3bis, (_ticks + 50) % 100);
			transformCircle(_logoCircle2bis, (_ticks + 75) % 100);

			_ticks++;

			if (_ticks >= 100) {
				_ticks = 0;
			}
		}
		else { //if logo animation has been turned off

			//ramp up the opacity slowly
			_logoCircle2.setAttribute("stroke-opacity", (parseFloat(_logoCircle2.getAttribute("stroke-opacity")) + 0.08));
			_logoCircle4.setAttribute("stroke-opacity", (parseFloat(_logoCircle4.getAttribute("stroke-opacity")) + 0.01));

			if (_logoCircle2.getAttribute("stroke-opacity") >= 1) {
				clearInterval(_timer);
				_outroAnimation = false;
			}
		}
		if (_introAnimation && _ticks === 50) {
			_introAnimation = false;
		}
	}

	function transformCircle(circle, ticks) {

		circle.setAttribute("r", 10 + (ticks / 4));

		//if we've just started the animation, don't try and fade in the already fully opaque circles
		if (_introAnimation) {
			circle.setAttribute("stroke-opacity", (ticks < 50) ? 1 : (ticks - 80) / - 30);
		}
		else {
			//Does a linear transition across the following values
			//0% = 0 opacity
			//20% = 1 opacity
			//50% = 1 opacity
			//80% = 0 opacity
			circle.setAttribute("stroke-opacity", (ticks <= 20) ? ticks / 20: (ticks < 50) ? 1 : (ticks - 80) / - 30);
		}
	}

	this.setPercent = function(percent) {
		if (percent >= 100) {
			_that.stop();
		}
		else {
			_that.start();
		}
	};

	this.start = function() {
		if (_logoPlaying) {
			return;
		}
		else {
			_logoPlaying = true;
			_introAnimation = true;

			//ensures we don't start another game loop while the outro is playing
			if (!_outroAnimation) {
				//start at the same time every time. 32 ~= the photosynth logo
				_ticks = 32;
				_timer = setInterval(function(){_requestAnimFrameId = requestAnimationFrame(animateLogo); }, 25); //40fps, chosen because it was a good mix of performance + smoothness on browsers. Any faster and IE seems to have issues. Any slower and it gets jerky
			}
			_outroAnimation = false;
		}
	};

	this.stop = function() {
		if (!_logoPlaying) {
			return;
		}
		else {
			_logoPlaying = false;
			_outroAnimation = true;
		}
	};

	this.setVisible = function(visible) {
		_svg.style.display = visible ? "" : "none";
	};
};
