"use strict";

/* global module */

module.exports = function(grunt) {

	grunt.loadNpmTasks('grunt-contrib-concat');
	grunt.loadNpmTasks('grunt-contrib-uglify');
	grunt.loadNpmTasks('grunt-contrib-jshint');
	grunt.loadNpmTasks('grunt-contrib-clean');
	grunt.loadNpmTasks('grunt-contrib-cssmin');
	grunt.loadNpmTasks('grunt-contrib-jasmine');
	grunt.loadNpmTasks('grunt-contrib-copy');
	grunt.loadNpmTasks('grunt-lintspaces');
	grunt.loadNpmTasks('grunt-mkdir');
	grunt.loadNpmTasks('grunt-rename');
	grunt.loadNpmTasks('grunt-sloc');

	var _jsFilesToScan = [
		'src/AnnotationEditor/**/*.js',
		'src/AnnotationViewer/**/*.js',
		'src/API/**/*.js',
		'src/Core/**/*.js',
		'src/Exif/**/*.js',
		'src/PacketPlayer/**/*.js',
		'src/SDK/**/*.js',
		'src/Progress/**/*.js',
		'src/ThirdParty/TrackballControls.js',
		'web/js/*.js',
		'web/js/connections/*.js',
		'web/js/graph/fillSynthGraph.js',
		'web/js/map/Synth*.js',
		'web/js/pano/*.js',
		'web/js/playground/*.js',
		'test/spec/*.js',
		'utils/AnnotationStorage/import.js',
		'utils/AnnotationStorage/server.js',
		'utils/AnnotationStorage/routes/synths.js',
		'utils/SynthLinker/linker.js',
		'utils/SynthLinker/server.js',
		'utils/SimpleHttpServer/*.js',
		'Gruntfile.js'
	];

	var _cssFilesToScan = [
		'css/*.css',
		'web/css/*.css'
	];

	var _htmlFilesToScan = [
		'web/*.html',
		'utils/**/*.bat'
	];

	grunt.initConfig({
		pkg: grunt.file.readJSON('package.json'),

		clean: {
			all: ['build/*.*', 'build/js/', 'build/css/'],
			tmp: ['build/tmp*.*'],
		},
		concat: {
			//create inline web worker
			worker: {
				options: {
					banner: 'PS.Packet.WorkerParser=\'',
					footer: '\';',
					separator: ' \\'
				},
				src: 'build/PS2PacketPlayer.worker.min.js',
				dest: 'build/tmp.PS2PacketPlayer.worker.inline.min.js'
			},
			dist: {
				src: [
					'build/tmp.PS2PacketPlayer.iefix.min.js',
					'src/ThirdParty/three.min.js',
					'src/ThirdParty/dat.gui.min.js',
					'src/ThirdParty/openseadragon.min.js',
					'src/ThirdParty/autolinker.min.js',
					'src/ThirdParty/TrackballControls.js',
					'build/tmp.PS2PacketPlayer.min.js',
					'build/tmp.PS2PacketPlayer.worker.inline.min.js',
					'build/tmp.PS2PacketPlayerSDK.min.js'
				],
				dest: 'build/js/PS2PacketPlayer.min.js'
			}
		},

		uglify: {
			options: {
				mangle: true
			},
			player: {
				files: {
					'build/tmp.PS2PacketPlayer.min.js': [

						//Core
						'src/Core/Core.js',
						'src/Core/WebGLMemoryUsage.js',
						'src/Core/Touch/MultiTouchGestureHandler.js',
						'src/Core/Touch/SingleTouchInputHandler.js',
						'src/Core/Utils/Utils.js',
						'src/Core/Utils/Async/Async.js',
						'src/Core/Utils/Async/Parallel.js',
						'src/Core/Utils/Async/Queue.js',
						'src/Core/Utils/Async/PriorityQueue.js',
						'src/Core/Utils/Request/Request.js',
						'src/Core/Utils/Tween/legacy.js',
						'src/Core/Utils/Tween/Tween.js',

						//Progress
						'src/Progress/Progress.js',

						//Exif
						'src/Exif/Exif.js',

						//PacketPlayer
						'src/PacketPlayer/PacketPlayer.js',
						'src/PacketPlayer/ViewerOptions.js',
						'src/PacketPlayer/Map/MapViewer.js',
						'src/PacketPlayer/Metadata/Viewer.js',
						'src/PacketPlayer/Metadata/ProgressIndicator.js',
						'src/PacketPlayer/PacketViewer/Camera.js',
						'src/PacketPlayer/PacketViewer/Dataset.js',
						'src/PacketPlayer/PacketViewer/DatasetLoader.js',
						'src/PacketPlayer/PacketViewer/DatasetLoaderWorker.js',
						'src/PacketPlayer/PacketViewer/GestureVelocity.js',
						'src/PacketPlayer/PacketViewer/KeyboardVelocity.js',
						'src/PacketPlayer/PacketViewer/MultiViewerCameraController.js',
						'src/PacketPlayer/PacketViewer/OffscreenScene.js',
						'src/PacketPlayer/PacketViewer/PacketRenderer.js',
						'src/PacketPlayer/PacketViewer/PacketViewer.js',
						'src/PacketPlayer/PacketViewer/Parser.js',
						'src/PacketPlayer/PacketViewer/Path.js',
						'src/PacketPlayer/PacketViewer/Shaders.js',
						//'src/PacketPlayer/PacketViewer/WorkerParser.js', //DO NOT INCLUDE THIS FILE!
						'src/PacketPlayer/Seadragon/Viewer.js',

						//Annotations
						'src/AnnotationViewer/AnnotationViewer.js',
						'src/AnnotationEditor/AnnotationGeometryService.js',
						'src/AnnotationEditor/AnnotationVisibilityServiceFallback.js',
						'src/AnnotationEditor/AnnotationVisibilityService.js',
						'src/AnnotationEditor/AnnotationBuilder.js',
						'src/AnnotationEditor/AnnotationVisibilityControl.js',
						'src/AnnotationEditor/AnnotationEditor.js'
					]
				}
			},
			SDK: {
				files: {
					'build/tmp.PS2PacketPlayerSDK.min.js': [
						'src/SDK/SDK.js',
						'src/SDK/EventDispatcher.js',
						'src/SDK/PacketPlayer.js',
						'src/SDK/PacketPlayerEventDispatcher.js',
						'src/SDK/AnnotationViewer.js',
						'src/SDK/AnnotationViewerEventDispatcher.js',
						'src/SDK/AnnotationEditor.js',
						'src/SDK/AnnotationEditorEventDispatcher.js'
					]
				}
			},
			worker: {
				files: {
					'build/js/PS2PacketPlayer.worker.min.js': 'src/PacketPlayer/PacketViewer/WorkerParser.js'
				}
			},
			iefix: {
				files: {
					'build/tmp.PS2PacketPlayer.iefix.min.js': 'src/ThirdParty/ie.float32array.js'
				}
			},
			api: {
				files: {
					'build/js/PS2API.min.js': [
						'src/API/Photosynth.js',
						'src/API/PhotosynthRead.js',
						//'src/API/PhotosynthWrite.js', //used by the chrome extension (not useful without credential)
						//'src/API/GeoWikipedia.js',    //used by the chrome extension
						'src/API/SimpleAnnotationProxy.js',
						'src/API/SimpleAnnotationStorage.js',
						'src/API/SimpleFileWriter.js',
						'src/API/SimpleStaticStorage.js',
						'src/API/SimpleSynthLinker.js'
					]
				}
			}
		},
		cssmin: {
			dist: {
				files: {
					'build/css/PS2PacketPlayer.min.css': ['css/PS2PacketPlayer.css', 'css/PS2AnnotationEditor.css']
				}
			}
		},
		jasmine: {
			src: ['src/Core/Core.js'],
			options: {
				specs: "test/spec/**/*.js"
			}
		},
		jshint: {
			options: {
				"browser":      true,
				"devel":        true,
				"globalstrict": true,
				"curly":        true,
				"eqeqeq":       true,
				"forin":        true,
				"freeze":       true,
				"undef":        true,
				"unused" :      true,
				"strict":       true,
				"supernew":     true,
				"validthis":    true,
				"-W004":        true,
				"globals": {
					"PS":            false,
					"Photosynth":    false,
					"THREE":         false,
					"Autolinker":    false,
					"OpenSeadragon": false,
					"dat":           false, //dat.gui
					"$":             false, //jquery
					"Microsoft":     false, //bing maps
					"describe":      false, //jasmine test
					"it":            false, //jasmine test
					"expect":        false, //jasmine test
					"require":       false, //node.js
					"exports":       false, //node.js
					"process":       false  //node.js
				}
			},
			dist: _jsFilesToScan
		},
		lintspaces: {
			javascript: {
				src: _jsFilesToScan.concat(_cssFilesToScan).concat(_htmlFilesToScan),
				options: {
					newline: true,
					trailingspaces: true,
					indentation: 'tabs',
					ignores: ['js-comments']
				}
			}
		},
		mkdir: {
			dist: {
				options: {
					create: ['build/js', 'build/css', 'build/css/PS2PacketPlayer', 'build/css/PS2AnnotationEditor']
				}
			}
		},
		copy: {
			css: {
				files: [
					{ src: ['css/PS2PacketPlayer/*'],     dest: 'build/' },
					{ src: ['css/PS2AnnotationEditor/*'], dest: 'build/' }
				]
			}
		},
		sloc: {
			dist: {
				files: {
					'./': _jsFilesToScan.concat(_cssFilesToScan).concat(_htmlFilesToScan)
				}
			}
		}
	});

	grunt.registerTask("build", ['clean:all', 'mkdir', 'uglify', 'concat:worker', 'concat:dist', 'cssmin:dist', 'copy:css', 'clean:tmp']); //build js/css files
	grunt.registerTask("test", ['jshint:dist', 'jasmine']); //js lint and unit test
	grunt.registerTask("pre-submit", ['lintspaces']); //whitespace

	grunt.registerTask("default", ['test', 'build']); //default = test then build
};
