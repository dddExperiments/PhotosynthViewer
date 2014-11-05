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

Photosynth.PS2AnnotationEditor = function(viewer, annotationViewer, containerDiv) {

	var _containerDiv = containerDiv;

	buildDom();

	var _viewer = viewer;
	var _internalPlayer; //TODO: get rid of this!!!

	var _annotationViewer = annotationViewer;
	var _internalAnnotationViewer = _annotationViewer.getInternal();

	var _eventDispatcher = new Photosynth.AnnotationEditorEventDispatcher();

	this.addEventListener = function(eventName, callback) {
		_eventDispatcher.addEventListener(eventName, callback);
	};

	this.removeEventListener = function(eventName, callback) {
		_eventDispatcher.removeEventListener(eventName, callback);
	};

	var _annotationEditor = new PS.Packet.Annotation.Editor(_internalAnnotationViewer, {
		alwaysUseHeuristic: true,
		onLayerVisibilityChange: function(visible) {
			_eventDispatcher.callbacks.onLayerVisibilityChange(visible);
		},
		onAnnotationPublished: function(annotation, annotationId, thumbInfo, callback) {
			_eventDispatcher.callbacks.onAnnotationPublished(annotation, thumbInfo, function(succeed, dbid) {
				if (succeed) {
					_internalAnnotationViewer.setPersistentId(annotationId, dbid);
				}
				callback(succeed);
			});
		},
		onCancel: function() {
			_eventDispatcher.callbacks.onCancel();
		},
		onSynthConnectionRequested: function(request, dbid) {
			_eventDispatcher.callbacks.onSynthConnectionRequested(request, dbid);
		}
	});

	this.getInternal = function() {
		return _annotationEditor;
	};

	_viewer.addEventListener("viewer-built", function() {
		_internalPlayer = _viewer.getInternal();
		_annotationEditor.init(_internalPlayer);
	});
	_viewer.addEventListener("camera-changed", function(cam) {
		_annotationEditor.onCameraChanged(cam);
	});
	_viewer.addEventListener("position-changed", function(qIndex) {
		_annotationEditor.setPosition(qIndex);
	});
	_viewer.addEventListener("resize", function(resizeState) {
		_annotationEditor.resize(resizeState);
	});
	_viewer.addEventListener("annotate", function() {
		_annotationEditor.start();
	});

	_annotationViewer.addEventListener("annotation-edit", function(annotation, tx, ty) {
		_annotationEditor.edit(annotation, tx, ty);
	});
	_annotationViewer.addEventListener("annotation-delete", function(annotation) {
		_eventDispatcher.callbacks.onAnnotationDelete(annotation, function(deleted) {
			if (deleted) {
				_internalAnnotationViewer.remove(annotation.id);
			}
		});
	});
	_annotationViewer.addEventListener("edited-annotation-move", function(annotation, tx, ty) {
		_annotationEditor.move(annotation, tx, ty);
	});


	function buildDom() {

		var str = "";

		//Annotation Editor layer
		str += '<div class="PSAnnotationEditorLayer" style="display: none;">';
		str += '	<div class="title">';
		str += '		Click to add a highlight <button class="exit" title="Cancel"></button>';
		str += '	</div>';
		str += '	<div class="preview" style="display: none;">';
		str += '		<div class="anchor"></div>';
		str += '		<div class="editPanel">';
		str += '			<div class="accordion selected">';
		str += '				<h3>caption</h3>';
		str += '				<div class="content">';
		str += '					<textarea maxlength="400">Add your note</textarea>';
		str += '				</div>';
		str += '			</div>';
		str += '			<div class="accordion">';
		str += '				<h3>visibility</h3>';
		str += '				<div class="content">';
		str += '					<p class="visibility-explanation">Select when the highlight is visible on the synth:</p>';
		str += '					<ul class="visibility-range-type">';
		str += '						<li><label value="auto"  ><input type="radio" name="ps2-visibility-range-type" value="auto" checked=checked />automatic</label></li>';
		str += '						<li><label value="all"   ><input type="radio" name="ps2-visibility-range-type" value="all" />show on all frames</label></li>';
		str += '						<li><label value="one"   ><input type="radio" name="ps2-visibility-range-type" value="one" />only show on current frame</label></li>';
		str += '						<li><label value="manual"><input type="radio" name="ps2-visibility-range-type" value="manual" />manual</label> <button class="edit"  disabled=disabled>edit visibility range</button></li>';
		str += '					</ul>';
		str += '				</div>';
		str += '			</div>';
		str += '			<div class="accordion">';
		str += '				<h3>synth connection</h3>';
		str += '				<div class="content">';
		str += '					<p style="color: white; margin-bottom: 5px; margin-top: 5px;">Please enter target synth URL:</p>';
		str += '					<input class="synth-url-selector" type="text" value="" style="width:320px; font-size: 14px;" />';
		str += '					<button class="connect" disabled=disabled style="margin-left: 0px; margin-top: 10px;">connect</button>';
		str += '				</div>';
		str += '			</div>';
		str += '			<div class="command" style="">';
		str += '				<button class="cancel">cancel</button> <button class="publish" style="margin-right: 5px;">save</button>';
		str += '			</div>';
		str += '		</div>';
		str += '	</div>';
		str += '</div>';

		//Annotation Visibility Control layer
		str += '<div class="PSAnnotationVisibilityLayer" style="display: none;">';
		str += '	<div class="toolbar">';
		str += '		<p>Drag the control points to adjust when the highlight is visible.</p>';
		str += '		<div class="slider-container">';
		str += '			<div class="slider-handle slider-start" title="start"></div>';
		str += '			<div class="slider-handle slider-stop"  title="stop"></div>';
		str += '			<div class="slider-range"></div>';
		str += '			<div class="slider-keyframe"></div>';
		str += '			<div class="slider-container-start"></div>';
		str += '			<div class="slider-container-stop"></div>';
		str += '		</div>';
		str += '		<button class="cancel" title="Cancel"></button> <button class="done">done</button>';
		str += '	</div>';
		str += '</div>';

		var div = document.createElement("div");
		div.innerHTML = str;

		_containerDiv.appendChild(div);

	}
};
