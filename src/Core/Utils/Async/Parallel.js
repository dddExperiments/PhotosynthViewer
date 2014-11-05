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

	PS.Utils.Async.parallel:
	------------------------
	Legacy class used in the viewer to make parallel calls (please use PS.Utils.Queue instead)

*/

//TODO: remove this and use Queue instead

PS.Utils.Async.parallel = function(tasks, callback) {
	var _nbTasks = tasks.length;
	var _results = new Array(_nbTasks);
	var _globalCallback = callback;
	var _nbCompleted    = 0;

	//jshint loopfunc: true
	for (var i=0; i<_nbTasks; ++i) {
		tasks[i](function() {
			var index = i;
			return function(err, result) {
				_nbCompleted++;
				if (err) {
					_globalCallback(err, null);
				}
				_results[index] = result;
				if (_nbCompleted === _nbTasks) {
					_globalCallback(null, _results);
				}
			};
		}());
	}
	//jshint loopfunc: false
};
