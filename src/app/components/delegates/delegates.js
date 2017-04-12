import './delegates.less';

app.component('delegates', {
  template: require('./delegates.pug')(),
  bindings: {
    account: '=',
    passphrase: '<',
  },
  controller: class delegates {
    constructor($scope, $peers, $mdDialog, $mdMedia, $mdToast) {
      this.$scope = $scope;
      this.$peers = $peers;
      this.$mdDialog = $mdDialog;
      this.$mdMedia = $mdMedia;
      this.$mdToast = $mdToast;

      this.$scope.search = '';
      this.voteList = [];
      this.votedDict = {};
      this.votedList = [];
      this.unvoteList = [];
      this.loading = true;
      this.usernameInput = '';
      this.usernameSeparator = '\n';

      this.updateAll();

      this.$scope.$watch('search', (search, oldValue) => {
        this.delegatesDisplayedCount = 20;
        if (search || oldValue) {
          this.loadDelegates(0, search, true);
        }
      });

      this.$scope.$on('peerUpdate', () => {
        this.updateAll();
      });
    }

    updateAll() {
      this.delegates = [];
      this.delegatesDisplayedCount = 20;
      this.$peers.sendRequestPromise('accounts/delegates', {
        address: this.account.address,
      }).then((data) => {
        this.votedList = data.delegates || [];
        (this.votedList).forEach((delegate) => {
          this.votedDict[delegate.username] = delegate;
        });
        this.loadDelegates(0, this.$scope.search);
      });
    }

    loadDelegates(offset, search, replace) {
      this.loading = true;
      this.$peers.sendRequestPromise(`delegates/${search ? 'search' : ''}`, {
        offset,
        limit: '100',
        q: search,
      }).then((data) => {
        this.addDelegates(data, replace);
      });
      this.lastSearch = search;
    }

    addDelegates(data, replace) {
      if (data.success) {
        if (replace) {
          this.delegates = [];
        }
        this.delegates = this.delegates.concat(data.delegates.map((delegate) => {
          const voted = this.votedDict[delegate.username] !== undefined;
          const changed = this.voteList.concat(this.unvoteList)
            .map(d => d.username).indexOf(delegate.username) !== -1;
          delegate.status = {  // eslint-disable-line no-param-reassign
            selected: (voted && !changed) || (!voted && changed),
            voted,
            changed,
          };
          return delegate;
        }));
        this.delegatesTotalCount = data.totalCount;
        this.loading = false;
      }
    }

    showMore() {
      if (this.delegatesDisplayedCount < this.delegates.length) {
        this.delegatesDisplayedCount += 20;
      }
      if (this.delegates.length - this.delegatesDisplayedCount <= 20 &&
          this.delegates.length < this.delegatesTotalCount &&
          !this.loading) {
        this.loadDelegates(this.delegates.length, this.$scope.search);
      }
    }

    selectionChange(delegate) {
      // eslint-disable-next-line no-param-reassign
      delegate.status.changed = delegate.status.voted !== delegate.status.selected;
      const list = delegate.status.voted ? this.unvoteList : this.voteList;
      if (delegate.status.changed) {
        list.push(delegate);
      } else {
        list.splice(list.indexOf(delegate), 1);
      }
    }

    clearSearch() {
      this.$scope.search = '';
    }

    addToUnvoteList(vote) {
      const delegate = this.delegates.filter(d => d.username === vote.username)[0] || vote;
      if (delegate.status.selected) {
        this.unvoteList.push(delegate);
      }
      delegate.status.selected = false;
    }

    clearVotes() {
      this.voteList.forEach((delegate) => {
        /* eslint-disable no-param-reassign */
        delegate.status.changed = false;
        delegate.status.voted = true;
      });
      this.voteList.splice(0, this.voteList.length);

      this.unvoteList.forEach((delegate) => {
        delegate.status.changed = false;
        delegate.status.voted = false;
        /* eslint-enable no-param-reassign */
      });
      this.unvoteList.splice(0, this.unvoteList.length);
    }

    selectListFromInput(list) {
      this.invalidUsernames = [];
      this.pendingRequests = 0;
      this.usernameList = this.usernameInput.trim().split(this.usernameSeparator);
      this.usernameList.forEach((username) => {
        if (!this.votedDict[username.trim()]) {
          this.setSelected(username.trim(), list);
        }
      });

      if (this.pendingRequests === 0) {
        this.selectFinish(true, list);
      }
    }

    selectFinish(success, list) {
      const toast = this.$mdToast.simple();
      toast.toastClass(success ? 'lsk-toast-success' : 'lsk-toast-error');
      let message = '';
      if (success) {
        message = `${this.usernameList.length} delegates selected. Now you can vote for them.`;
      } else if (list.length === 0) {
        message = 'No delegate usernames could be parsed from the input';
      } else {
        message = `Some usernames could not be resolved: ${this.invalidUsernames.join(', ')}`;
      }
      this.$mdToast.show(toast);
      toast.textContent(message);
      if (list.length !== 0) {
        this.usernameListActive = false;
        this.openVoteDialog();
      }
    }

    setSelected(username, list) {
      const delegate = this.delegates.filter(d => d.username === username)[0];
      if (delegate) {
        this.selectDelegate(delegate, list);
      } else {
        this.pendingRequests++;
        this.$peers.active.sendRequest('delegates/get', { username }, (data) => {
          if (data.success) {
            this.selectDelegate(data.delegate, list);
          } else {
            this.invalidUsernames.push(username);
          }
          this.pendingRequests--;
          if (this.pendingRequests === 0) {
            this.selectFinish(this.invalidUsernames.length === 0, list);
          }
        });
      }
    }

    selectDelegate(delegate, list) {
      // eslint-disable-next-line no-param-reassign
      delegate.status = delegate.status || {};
      // eslint-disable-next-line no-param-reassign
      delegate.status.selected = true;
      list.push(delegate);
      this.usernameInput = this.usernameInput
        .replace(delegate.username + this.usernameSeparator, '')
        .replace(delegate.username, '');
    }

    openVoteDialog() {
      this.$mdDialog.show({
        controllerAs: '$ctrl',
        controller: class voteDialog {
          constructor($scope, account, passphrase, voteList, unvoteList) {
            this.$scope = $scope;
            this.$scope.account = account;
            this.$scope.passphrase = passphrase;
            this.$scope.voteList = voteList;
            this.$scope.unvoteList = unvoteList;
          }
        },
        template:
          '<md-dialog>' +
            '<vote account="account" passphrase="passphrase" ' +
              'vote-list="voteList" unvote-list="unvoteList">' +
            '</vote>' +
          '</md-dialog>',
        fullscreen: (this.$mdMedia('sm') || this.$mdMedia('xs')) && this.$scope.customFullscreen,
        locals: {
          account: this.account,
          passphrase: this.passphrase,
          voteList: this.voteList,
          unvoteList: this.unvoteList,
        },
      }).then((() => {
        this.clearVotes();
      }));
    }
  },
});

