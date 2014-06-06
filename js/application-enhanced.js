(function() {
    'use strict';

    var Application, AppView, SearchResultsView, 
        SearchBar, StageSpace,
        self;

    /**
     *  Main App View
     */
    AppView = Backbone.View.extend({
        initialize: function(options) {
            _.extend(this,options);
            // Create the HTML element
            this.$elem = $('<article class="app-view">');
            // grab template data
            this.template = $('main-stage').text();
            // inject automatically into the body
            $('body').append(this.$elem);
            // append our other views
            this.$elem.append(this.searchBar.getElem());
            this.$elem.append(this.stageSpaceView.getElem());
            this.$elem.append(this.searchResultsView.getElem());
        },
        render: function() {
            this.searchResultsView.render();
        },
    });

    /**
     *  Search Results View
     */
    SearchResultsView = function(options) {
        this.initialize(options);
    };
    SearchResultsView.prototype = {
        initialize: function(options) {
            _.extend(this,Backbone.Events,options);
            // create the HTML element
            this.$elem = $('<section class="search-results collection-view">');
            // grab template partial from DOM
            this.template = $('#collection-view').text();
            // bind single click handler for view since we'll
            // be updating content repeatedly, less room for
            // memory leakage, whether in this code or webkit's.
            this.$elem.on('click', this.didSelectItem.bind(this));
        },
        setResults: function(resultsCollection) {
            if (!resultsCollection || resultsCollection.length === 0) return;

            this.collection = resultsCollection;
            this.render();
            this.$elem.scrollTop(0);
        },
        render: function() {
            if (!this.collection) return;
            this.resultCount = this.collection.models.length;
            this.$elem.html(Mustache.to_html(this.template, {items: this.collection.models}));
            this.elements = this.$elem.find('.result-item');
        },
        didSelectItem: function(evt) {
            var videoModel = (evt) ? evt.video : null,
                $resultView;
            if (!videoModel) {
                videoModel = this.collection.findWhere({id: $(evt.target).closest('.result-item').attr('id')});
            }
            this.$elem.find('.result-item').removeClass('selected');
            $resultView = this.$elem.find('#'+videoModel.get('id')).addClass('selected');

            this.trigger('didSelectItem', videoModel);
        },
        getElem: function() {
            return this.$elem;
        }
    };

    var VideoView = {
        returnToShelf: function() {
            var e = this[0], sP, $container;
            if (!e) return this;
            sP = e._shelfPosition;
            this.rotateX(sP.theta);
            this.rotateY(sP.phi);
            this.translate3d(sP);
            $container = this.find('.video-container').remove();
            this.append($container);

            if(e.$reflection) {
                e.$reflection.returnToShelf();
            }

            return this;
        },
        rotateX: function(theta) {
            var e = this[0], T = e.style.webkitTransform;
            T = T.replace(/\s?rotateX\([0-9\s deg,-]+\)/g, "");
            e.style.webkitTransform = T + " rotateX("+theta+"deg)";
            return this;
        },
        rotateY: function(phi) {
            var e = this[0], T = e.style.webkitTransform;
            T = T.replace(/\s?rotateY\([0-9\s deg,-]+\)/g, "");
            e.style.webkitTransform = T + " rotateY("+phi+"deg)";
            return this;
        },
        translate3d: function(newPos) {
            var e = this[0], t = e._translation || {x: 0, y: 0, z: 0},
                T = e.style.webkitTransform;

            t.x = (newPos.x != null) ? newPos.x : t.x;
            t.y = (newPos.y != null) ? newPos.y : t.y;
            t.z = (newPos.z != null) ? newPos.z : t.z;
            e._translation = t;
            T = T.replace(/\s?translate3d\([0-9\s px%,-]+\)/g, "");
            e.style.webkitTransform = T + " translate3d("+t.x+"px,"+t.y+"px,"+t.z+"px)";
            return this;
        },
        translateX: function(xPos) {
            var e = this[0], t = e._translation || {x: 0, y: 0, z: 0};
            t.x = xPos;
            this.translate3d(t);
            return this;
        },
        translateY: function(yPos) {
            var e = this[0], t = e._translation || {x: 0, y: 0, z: 0};
            t.y = yPos;
            this.translate3d(t);
            return this;
        },
        translateZ: function(zPos) {
            var e = this[0], t = e._translation || {x: 0, y: 0, z: 0};
            t.z = zPos;
            this.translate3d(t);
            return this;
        }
    };

    $.extend($.fn, VideoView);


    StageSpace = function(options) {
        this.initialize(options);
    };
    StageSpace.prototype = new SearchResultsView;
    _.extend(StageSpace.prototype, {
        initialize: function(options) {
            _.extend(this,Backbone.Events,options);
            this.$elem = $('<section class="stage-space">');
            // grab template partial from DOM
            this.template = $('#large-preview').text();
            this._currentViews = [];
            this.spacing = 200;
            this.$elem.rotateY(0);
            this.listenTo(YouTube, 'change', this.searchResultsAvailable.bind(this));
            this.on('didSelectItemAtIndex', this.didSelectItemAtIndex.bind(this));

            // clear the watchdog timer since we must be functioning
            // if we're at this point
            clearTimeout(window.watchdog);
            console.log("watchdog cleared");
        },
        searchResultsAvailable: function(result) {
            var incomingSeachResults, $incomingResultView;
            this.resultsCollection = result.get('results');
            incomingSeachResults = this.resultsCollection.models;
            $incomingResultView  = this.parseAndRenderResultView(incomingSeachResults);
            this.transitionInResults($incomingResultView);
        },
        setOriginOffset: function(coordinate) {
            this.$elem.translate3d(coordinate);
        },
        parseAndRenderResultView: function(results) {
            return $('<div>').html(Mustache.to_html(this.template, {items: results}));
        },
        transitionInResults: function($incomingResultView) {
            this.deselectAll();

            var i, len, $view, $reflection, maxTransitionTime,
                $individualViews = $incomingResultView.find('.video').addClass("incoming"),
                spacing = this.spacing, timeSpacing = 100,
                transitionTimes = [],
                $elem = this.$elem,
                $reflectionsContainer = $incomingResultView.clone(),
                $reflections = $reflectionsContainer.find('.video').removeAttr('id');

            for (i = 0, len = $individualViews.length; i<len; i++) {
                $view = $individualViews.eq(i);
                $.extend($view, VideoView);
                $reflection = $reflections.eq(i);
                $view[0].viewIndex = i;

                $view[0].$reflection = $reflection;
                $view[0].$view = $view;
                $view[0]._shelfPosition = { x: 0, y:0, z: (-1 * i * spacing + 20), theta: 0, phi: 0 };
                $reflection[0]._shelfPosition = { x:0, y:0, z: (i * spacing - 20), theta: -180, phi: 0 };
                
                $view.translate3d($view[0]._shelfPosition);
                $reflection.translate3d($reflection[0]._shelfPosition);
                $reflection.rotateX(-180);
                $view.translateY(-500);
                $reflection.addClass('reflection').translateY(-500);



                transitionTimes.push((i*timeSpacing*(Math.random()*2)));

                (function($view, $reflection, delay){
                    setTimeout(function() {
                        $view.addClass('use-transition').removeClass('incoming').translateY(0);
                        $reflection.addClass('use-transition').removeClass('incoming').translateY(0);
                    }, delay);
                }($view, $view[0].$reflection, transitionTimes[i]));


            }
            this._outgoingViews = this._currentViews;
            this._outgoingReflections = this._currentReflections;
            this._currentViews = $individualViews;
            this._currentReflections = $reflections;
            $elem.append($incomingResultView).append($reflectionsContainer);

            for (i = 0, len = this._outgoingViews.length; i<len; i++) {
                $view = this._outgoingViews[i].$view;
                $view.addClass('outgoing').translateX(-1000);
                $view[0].$reflection.addClass('outgoing').translateX(-1000);
            }

            maxTransitionTime = Math.max(transitionTimes);
            setTimeout(function() {
                $elem.find('.outgoing').remove();
            }, 1550);
        },
        appendVideoPlayer: function($videoView, videoModel) {
            var template, playerContainer;
            if (!$videoView[0]._iframe) {
                template = $('#video-player').text();
                playerContainer = $('<div class="video-container">').html(Mustache.to_html(template, {video: videoModel.attributes}));
                $videoView.append(playerContainer);
                $videoView[0]._iframe = playerContainer.find('iframe');
            }
            return $videoView[0]._iframe;
        },
        setZ: function(z) {
            var i, len, newPosZ, $view;
            for (i = 0, len = this._currentViews.length; i<len; i++ ) {
                newPosZ = this._currentViews[i]._shelfPosition.z + z;
                $view = this._currentViews[i].$view;
                $view.translateZ(newPosZ);
                $view[0].$reflection.translateZ(-1*newPosZ);
                if (newPosZ > 0) {
                    $view.addClass('behind-camera');
                }
            }
            setTimeout(function() {
                this.$elem.find('.behind-camera').css('display', 'none');
            }.bind(this), 1000);
            return this.$elem;
        },
        didSelectItemAtIndex: function(videoModel) {
            var $videoView, $iFrame;

            this.deselectAll();

            $videoView = this.$elem.find('#'+videoModel.get('id')+'-preview');
            $iFrame = this.appendVideoPlayer($videoView, videoModel);
            //this.$elem.translate3d({ x:0, y: 500, z: $videoView[0]._translation.z });
            this.setZ(-1*$videoView[0]._shelfPosition.z).translateY(450).rotateY(0);
            //this.$elem.translate3d({ y: 450, z: -1*$videoView[0]._shelfPosition.z});
            $videoView.rotateY(180).translate3d({x: -0, y: -600, z: 0});
            this._currentSelectedVideo = $videoView;
        },
        deselectAll: function() {
            if (this._currentSelectedVideo) this._currentSelectedVideo.returnToShelf();
            this._currentSelectedVideo = null;
            this.$elem.find('.behind-camera').css('display', 'block').removeClass('behind-camera');
            this.setZ(0).translateY(0).rotateY(0);
        }
    });

    /**
     *  Search Bar
     */
    SearchBar = function(options) {
        _.extend(this, Backbone.Events, options);
        // create the HTML element
        this.$elem = $('<section class="search-bar">');
        // grab template text from DOM
        this.template = $('#search-bar').text();
        // search bar is static so render it now
        this.render();
        // cache reference to our searchField
        this.$searchField = this.$elem.find('.search-bar-input');
        // easy bind for return
        this.$elem.find('form').on('submit', this.handleSearchBtnClick.bind(this));
        // listen for hashChange to know whether to update
        // search field value
        this.listenTo(this.appController, 'location.hashDidChange', this.handleHashChange.bind(this));
    };
    SearchBar.prototype = {
        render: function() {
            var templateData = {searchQuery: ''};
            if (this.searchQuery) {
                templateData.searchQuery = this.searchQuery;
            }
            this.$elem.html(Mustache.to_html(this.template, templateData));
        },
        getElem: function() {
            return this.$elem;
        },
        handleSearchBtnClick: function(evt) {
            var searchQuery;
            evt.preventDefault();
            this.$searchField.blur();
            searchQuery = this.$searchField.val();
            if (!searchQuery) return;
            this.appController.trigger('search.doSearch', searchQuery);
            return false;
        },
        handleHashChange: function(params) {
            this.$searchField.val(params.q);
        }
    };


    /**
     *  Shared Application Controller
     */
    Application = function() {
        // prevent multiple instances of Shared App Controller
        if (self) return self;
        // event notification
        _.extend(this, Backbone.Events);

        // setup some events
        this.on('search.doSearch', this.doSearch);
        // listen to API change notification and perform the searchCallback
        this.listenTo(YouTube, 'change', this.searchCallback.bind(this));
        // hash observing to handle history
        $(window).on('hashchange', this.handleHashChange.bind(this));
        // run our setup
        this.init();
        // define our singleton
        self = this;
    };

    Application.prototype = {
        init: function() {
            var pageParams = this.getPageParamsHash() || {q:null};   
            // create our views and retain references
            this.sectionViews = {
                searchBar: new SearchBar({appController: this, searchQuery: pageParams.q}),
                stageSpaceView: new StageSpace({appController: this}),
                searchResultsView: new SearchResultsView({appController: this}),
            }
            this.listenTo(this.sectionViews.searchResultsView, 'didSelectItem', this.handleSelect.bind(this));
            // create the primary view
            this.appView = new AppView(this.sectionViews);
            // render it
            this.appView.render();

            // set the API version
            // this enhanced app defaults to v3
            if (pageParams && pageParams.apiVersion === 'v2') {
                YouTube.set('useApiVersion', 'v2');
            } else {
                YouTube.set('useApiVersion', 'v3');
            }
            //YouTube.set('useChannelSearch', true);
            // kick off an initial search to populate the UI
            this.doSearch(pageParams.q, function() {
                self.sectionViews.searchResultsView.render();
            });
        },
        searchCallback: function(resultsCollection) {
            var collection = resultsCollection.get('results');
            // inform the searchResultsView we have new results to show
            this.sectionViews.searchResultsView.setResults(collection);
        },
        doSearch: function(query, cb, updateHash) {
            // bail if no queryString is provided
            if (!query) return;
            // set our searchQuery so our handleHashChange
            // can prevent infinite noficiations
            this.searchQuery = query;
            // default to updating the hash, only skip if falsey
            if (updateHash || updateHash == null) {
                this._pageParamsHash = null;
                window.location.hash = "q="+encodeURIComponent(query);
            }
            // Set our query params on our API object
            YouTube.setQueryParams({q:query});
            // kick off the fetch request
            YouTube.fetch();
        },
        getPageParamsHash: function() {
            var i, len, parts, parsedParams, params;
            // return cached params object if it exists
            if (this._pageParamsHash) return this._pageParamsHash;
            // setup a new object to be cached
            parsedParams = {};
            // pull the params out of the hash
            params = window.location.hash.substr(1).split('&');
            // parse the params out
            for (i = 0, len = params.length; i < len; i++) {
                parts = params[i].split('=');
                parsedParams[decodeURIComponent(parts[0])] = decodeURIComponent(parts[1]);
            }
            // assign and return our parsedParams object
            return this._pageParamsHash = parsedParams;
        },
        handleSelect: function(videoModel) {
            this.sectionViews.stageSpaceView.trigger('didSelectItemAtIndex', videoModel);
        },
        handleHashChange: function(evt) {
            // grab the new hash
            var params = this.getPageParamsHash();
            // bust our params cache
            this._pageParamsHash = null;
            // bail if no query string
            if (!params || !params.q) return;
            // no-op if it's what we've just searched for
            if (params.q.toLowerCase() === this.searchQuery.toLowerCase()) {
                return;
            }
            // notify observers of hash change
            this.trigger('location.hashDidChange', params);
            // perform the search
            this.doSearch(params.q, null, false);
        }
    };

    // Instantiate
    window.SharedApp = new Application();

}());