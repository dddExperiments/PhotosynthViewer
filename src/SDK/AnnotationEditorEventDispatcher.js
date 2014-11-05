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

Photosynth.AnnotationEditorEventDispatcher = function() {

	var _that = new Photosynth.EventDispatcher([
		"visibility-change",
		"cancel",
		"annotation-created",
		"annotation-edited",
		"annotation-delete",
		"synth-connection-requested"
	]);

	_that.callbacks = {
		onLayerVisibilityChange: function() {
			_that.fireCallbacks("visibility-change", _that.toArray(arguments));
		},
		onCancel: function() {
			_that.fireCallbacks("cancel", _that.toArray(arguments));
		},
		onAnnotationPublished: function(annotation/*, thumbInfo, callback*/) {
			if (annotation.dbid) { //update annotation
				_that.fireCallbacks("annotation-edited", _that.toArray(arguments));
			}
			else {//create new annotation
				_that.fireCallbacks("annotation-created", _that.toArray(arguments));
			}
		},
		onAnnotationDelete: function() {
			_that.fireCallbacks("annotation-delete", _that.toArray(arguments));
		},
		onSynthConnectionRequested: function() {
			_that.fireCallbacks("synth-connection-requested", _that.toArray(arguments));
		}
	};

	return _that;
};
