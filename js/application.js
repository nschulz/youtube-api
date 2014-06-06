(function() {
    'use strict';

    var Application, AppView, SearchResultsView, 
        SearchBar, StageView,
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
            this.$elem.append(this.stageView.getElem());
            this.$elem.append(this.searchResultsView.getElem());
        },
        render: function() {
            this.stageView.render();
            this.searchResultsView.render();
        },
    });

    /**
     *  Search Results View
     */
    SearchResultsView = function(options) {
        _.extend(this,options);
        // create the HTML element
        this.$elem = $('<section class="search-results collection-view">');
        // grab template partial from DOM
        this.template = $('#collection-view').text();
        // bind single click handler for view since we'll
        // be updating content repeatedly, less room for
        // memory leakage, whether in this code or webkit's.
        this.$elem.on('click', this.didSelectItem.bind(this));
    };
    SearchResultsView.prototype = {
        setResults: function(resultsCollection) {
            if (!resultsCollection || resultsCollection.length === 0) return;

            this.collection = resultsCollection;
            this.render();
            this.$elem.scrollTop(0);
            this.didSelectItem({ video: this.collection.at(0) });
        },
        render: function() {
            if (!this.collection) return;

            this.$elem.html(Mustache.to_html(this.template, {items: this.collection.models}));
        },
        didSelectItem: function(evt) {
            var video = (evt) ? evt.video : null;
            if (!video) {
                video = this.collection.findWhere({id: $(evt.target).closest('.result-item').attr('id')});
            }
            this.$elem.find('.result-item').removeClass('selected');
            this.$elem.find('#'+video.get('id')).addClass('selected');

            this.appController.trigger('searchResults.didSelectItem', video);
        },
        getElem: function() {
            return this.$elem;
        }
    };

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
            evt.preventDefault();
            this.$searchField.blur();
            var searchQuery = this.$searchField.val();
            if (!searchQuery) return;
            this.appController.trigger('search.doSearch', searchQuery);
            return false;
        },
        handleHashChange: function(params) {
            this.$searchField.val(params.q);
        }
    };

    /**
     *  Stage View
     */
    StageView = function(options) {
        // start with an empty video model object
        this.video = new YouTube.YouTubeVideoModel({id: 'no_video_id'});
        _.extend(this, options);
        // create our HTML element
        this.$elem = $('<section class="main-stage">');
        // grab template text from DOM
        this.template = $('#main-stage').text();
    };
    StageView.prototype = {
        setVideo: function(aVideo) {
            this.video = aVideo;
            this.render();
        },
        render: function() {
            this.$elem.html(Mustache.to_html(this.template, {video: this.video.attributes}));
        },
        getElem: function() {
            return this.$elem;
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
        this.on('searchResults.didSelectItem', this.handleSelect.bind(this));
        this.on('search.doSearch', this.doSearch);
        // listen to API change notification and perform the searchCallback
        this.listenTo(YouTube, 'change', this.searchCallback);
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
                stageView: new StageView({appController: this}),
                searchBar: new SearchBar({appController: this, searchQuery: pageParams.q}),
                searchResultsView: new SearchResultsView({appController: this}),
            }

            // set the API version
            // this standard app defaults to v2
            if (pageParams && pageParams.apiVersion === 'v3') {
                YouTube.set('useApiVersion', 'v3');
            } else {
                YouTube.set('useApiVersion', 'v2');
            }

            // create the primary view
            this.appView = new AppView(this.sectionViews);
            // render it
            this.appView.render();
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
        handleSelect: function(aVideo) {
            this.sectionViews.stageView.setVideo(aVideo);
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