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

	- PS.Tween class
		- very basic adhoc tween class with hard-coded Exponential.Out transition
		- Please use PS.FX.Tween instead
*/

PS.Tween = {

	create: function(options) {
		var _options = {
			duration: 300,
			start: 0,
			end: 1,
			onStart: function() {},
			onUpdate: function() {},
			onComplete: function() {}
		};
		PS.extend(_options, options);

		var _startTime, _endTime, _request, _range;
		var _started   = false;
		var _completed = false;
		var _stopped   = false;

		function update() {
			var now = Date.now();

			if (now > _endTime) {
				_completed = true;
				_stopped   = true;
				_options.onComplete(_options.end, 1);
				return;
			}
			else {
				var percent = (now -_startTime)/_options.duration;
				percent = percent === 1 ? 1 : 1 - Math.pow(2, -10*percent); //Exponential.Out transition
				_options.onUpdate(_range*percent+_options.start, percent);
				_request = window.requestAnimationFrame(update);
			}
		}

		this.start = function() {

			if (_started) {
				return;
			}
			_startTime = Date.now();
			_endTime   = _startTime + _options.duration;
			_range     = _options.end - _options.start;
			_request   = window.requestAnimationFrame(update);
			_started   = true;
			_completed = false;
			_stopped   = false;
			_options.onStart(_options.start, 0);

			return this;
		};

		this.stop = function() {
			_stopped = true;
			if (_started) {
				window.cancelAnimationFrame(_request);
			}

			return this;
		};

		this.running = function() {
			return _started && !_stopped && !_completed;
		};

		this.done = function() {
			return _completed;
		};

		this.stopped = function() {
			return _stopped;
		};

		return this;
	}
};
