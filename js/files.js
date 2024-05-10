(function() {

	var LOCK_TYPE_USER = 0;
	var LOCK_TYPE_APP = 1;

	_.extend(OC.Files.Client, {
		PROPERTY_FILES_LOCK: '{' + OC.Files.Client.NS_NEXTCLOUD + '}lock',
		PROPERTY_FILES_LOCK_OWNER: '{' + OC.Files.Client.NS_NEXTCLOUD + '}lock-owner',
		PROPERTY_FILES_LOCK_OWNER_DISPLAYNAME: '{' + OC.Files.Client.NS_NEXTCLOUD + '}lock-owner-displayname',
		PROPERTY_FILES_LOCK_OWNER_TYPE: '{' + OC.Files.Client.NS_NEXTCLOUD + '}lock-owner-type',
		PROPERTY_FILES_LOCK_OWNER_EDITOR: '{' + OC.Files.Client.NS_NEXTCLOUD + '}lock-owner-editor',
		PROPERTY_FILES_LOCK_TIME: '{' + OC.Files.Client.NS_NEXTCLOUD + '}lock-time'
	})

	var FilesPlugin = {
		attach: function(fileList) {
			var self = this

			var oldGetWebdavProperties = fileList._getWebdavProperties
			fileList._getWebdavProperties = function() {
				var props = oldGetWebdavProperties.apply(this, arguments)
				props.push(OC.Files.Client.PROPERTY_FILES_LOCK)
				props.push(OC.Files.Client.PROPERTY_FILES_LOCK_OWNER)
				props.push(OC.Files.Client.PROPERTY_FILES_LOCK_OWNER_DISPLAYNAME)
				props.push(OC.Files.Client.PROPERTY_FILES_LOCK_TIME)
				props.push(OC.Files.Client.PROPERTY_FILES_LOCK_OWNER_TYPE)
				props.push(OC.Files.Client.PROPERTY_FILES_LOCK_OWNER_EDITOR)
				return props
			}

			fileList.filesClient.addFileInfoParser(function(response) {
				var data = {}
				var props = response.propStat[0].properties
				var isLocked = props[OC.Files.Client.PROPERTY_FILES_LOCK]
				if (!_.isUndefined(isLocked) && isLocked !== '') {
					data.locked = isLocked === '1'
					data.lockOwnerType = props[OC.Files.Client.PROPERTY_FILES_LOCK_OWNER_TYPE]
					data.lockOwnerEditor = props[OC.Files.Client.PROPERTY_FILES_LOCK_OWNER_EDITOR]
					data.lockOwner = props[OC.Files.Client.PROPERTY_FILES_LOCK_OWNER]
					data.lockOwnerDisplayname = props[OC.Files.Client.PROPERTY_FILES_LOCK_OWNER_DISPLAYNAME]
					data.lockTime = props[OC.Files.Client.PROPERTY_FILES_LOCK_TIME]
				}
				return data
			})

			var oldElementToFile = fileList.elementToFile
			fileList.elementToFile = function($el) {
				var fileData = oldElementToFile.apply(this, arguments)
				fileData.locked = $el.data('locked')
				fileData.lockOwnerType = $el.data('lock-owner-type')
				fileData.lockOwnerEditor = $el.data('lock-owner-editor')
				fileData.lockOwner = $el.data('lock-owner')
				fileData.lockOwnerDisplayname = $el.data('lock-owner-displayname')
				fileData.lockTime = $el.data('lock-time')
				return fileData
			}

			var oldCreateRow = fileList._createRow
			fileList._createRow = function(fileData) {
				var $tr = oldCreateRow.apply(this, arguments)
				if (fileData.locked) {
					$tr.attr('data-locked', fileData.locked)
					$tr.attr('data-lock-owner-type', fileData.lockOwnerType)
					$tr.attr('data-lock-owner-editor', fileData.lockOwnerEditor)
					$tr.attr('data-lock-owner', fileData.lockOwner)
					$tr.attr('data-lock-owner-displayname', fileData.lockOwnerDisplayname)
					$tr.attr('data-lock-time', fileData.lockTime)
				}
				return $tr
			}

			fileList.fileActions.registerAction({
				name: 'Locking',
				displayName: function(context) {
					if (context && context.$file) {
						var locked = context.$file.data('locked')
						if (locked) {
							return t('files_lock', 'Unlock file')
						}
					}
					return t('files_lock', 'Lock file')
				},
				mime: 'file',
				order: -139,
				iconClass: 'icon-password',
				permissions: OC.PERMISSION_READ,
				actionHandler: self.switchLock
			})
			fileList.fileActions.registerAction({
				name: 'LockingDetails',
				displayName: function(context) {
					if (context && context.$file) {
						var locked = context.$file.data('locked')
						if (locked) {
							return t('files_lock', 'Locked by {0}', [ context.$file.data('lockOwnerDisplayname') ])
						}
					}
					return '';
				},
				mime: 'file',
				order: -141,
				iconClass: '',
				icon: function(fileName, context) {
					var lockOwner = context.$file.data('lockOwner')
					console.log(lockOwner)
					if (lockOwner) {
						return OC.generateUrl(`/avatar/${lockOwner}/32`)
					}
				},
				permissions: OC.PERMISSION_READ,
				actionHandler: function () {}
			})

			fileList.fileActions.registerAction({
				name: 'LockingInline',
				render: function(actionSpec, isDefault, context) {
					var locked = context.$file.data('locked')
					var $actionLink = $('<span/>')
					if (locked) {
						$actionLink.addClass('locking-inline-state')
						$actionLink.addClass('icon-password')
						$actionLink.tooltip({ title: 'Locked by ' + context.$file.data('lock-owner-displayname')})
					}
					context.$file.find('a.name>span.fileactions').append($actionLink)
					return $actionLink
				},
				mime: 'file',
				order: -140,
				type: OCA.Files.FileActions.TYPE_INLINE,
				permissions: OC.PERMISSION_READ,
				actionHandler: self.switchLock
			})
		},

		switchLock: function(fileName, context) {
			var fileId = context.$file.data('id')
			var locked = context.$file.data('locked')
			var model = context.fileList.getModelForFile(fileName)
			if (locked !== undefined && locked) {
				$.ajax({
					method: 'DELETE',
					url: OC.linkToOCS('/apps/files_lock/lock', 2) + fileId + '?format=json'
				}).done(function(res) {
					model.set('locked', false)
				}).fail(function(res) {
					if (res.status === 412) {
						// No lock available so we assume unlocked
						model.set('locked', false)
						return;
					}
					OCP.Toast.warning(res.responseJSON.ocs.meta.message)
				});
			} else {
				$.ajax({
					method: 'PUT',
					url: OC.linkToOCS('/apps/files_lock/lock', 2) + fileId + '?format=json'
				}).done(function(res) {
					model.set('locked', true)
					model.set('lockOwner', OC.getCurrentUser().uid)
					model.set('lockOwnerDisplayname', OC.getCurrentUser().displayName)
				}).fail(function(res) {
					OCP.Toast.warning(res.responseJSON.ocs.meta.message)
				});
			}
		}

	};

	OC.Plugins.register('OCA.Files.FileList', FilesPlugin)

})();
