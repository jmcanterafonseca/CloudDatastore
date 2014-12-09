'use strict';

var ListManager = (function() {

  var notesListView = document.querySelector('#notes-list-view');
  var notesFormView = document.querySelector('#notes-form-view');
  var notesSettingsView = document.querySelector('#notes-settings-view');
  var notesAttachmentView = document.querySelector('#notes-attachment-view');


  var notesListElement = document.querySelector('#notes-list');

  var attachmentContainer = document.querySelector('#img-container');

  notesListElement.addEventListener('click', onEditNote);

  document.querySelector('#save-button').addEventListener('click', onSaveNote);
  document.querySelector('#add-note-button').addEventListener('click',
                                                              onNewNote);
  document.querySelector('#notes-form-header').addEventListener('action',
                                          backToList.bind(null, notesFormView));
  document.querySelector('#settings-button').addEventListener('click',
                                                              showSettings);

  document.querySelector('#settings-done-button').addEventListener('click',
                                      backToList.bind(null, notesSettingsView));

  document.querySelector('#clear-button').addEventListener('click',
                                                           onResetNotes);

  document.querySelector('#delete').addEventListener('click', onDeleteNote);

  document.querySelector('#attach-button').addEventListener('click', onAttach);

  document.querySelector('#notes-attachment-header').addEventListener('action',
                                          backToDetail);

  document.querySelector('#attachment-remove-button').addEventListener('click',
                                                    removeAttachment);

  var noteAttachment, attachmentThumbnail;

  var cloudDatastore, datastore;

  function onAttach() {
    var activity = new MozActivity({
      name: 'pick',
      data: {
        type: ['image/*', 'audio/*', 'video/*']
      }
    });

    activity.onsuccess = function() {
      noteAttachment = activity.result.blob;
      createThumbnail(noteAttachment, function(thumbnail) {
        attachmentThumbnail = thumbnail;
        buildAttachment(thumbnail);
      });
    }

    activity.onerror = () => alert(activity.error.name);
  }

  function removeAttachment() {
    resetAttachment();
    backToDetail();
  }

  function createThumbnail(attachment, cb) {
    var blobUrl = window.URL.createObjectURL(attachment);

    var img = new Image();
    img.src = blobUrl;
    window.console.log('Hereeeee', blobUrl);

    img.onload = function onBlobLoad() {
      window.console.log('Image on load');
      window.URL.revokeObjectURL(blobUrl);
      var width = img.naturalWidth;
      var height = img.naturalHeight;

      var targetValue = Math.min(width, height);
      var relationship = 106 / targetValue;

      // Make the image square
      var canvas1 = document.createElement('canvas');
      canvas1.width = width * relationship;
      canvas1.height = height * relationship;

      var context1 = canvas1.getContext('2d');
      context1.drawImage(img, 0, 0, canvas1.width, canvas1.height);

      var canvas = document.createElement('canvas');
      var targetWidth = canvas.width = canvas.height = 106;

      var context = canvas.getContext('2d');
      context.drawImage(canvas1, (canvas1.width - targetWidth) / 2,
                    (canvas1.height - targetWidth) / 2, targetWidth, targetWidth,
                    0, 0, targetWidth, targetWidth);
      console.log('Image drawn to canvas');

      canvas.toBlob(cb);
    }
  }

  function buildAttachment(blob) {
    var attachmentsList = document.querySelector('#attachments-list');
    var attachmentSection = document.querySelector('#attachment-section');
    attachmentsList.innerHTML = '';

    if (!blob) {
      attachmentSection.classList.add('hidden');
      document.querySelector('#attach-button').classList.remove('hidden');
      return;
    }

    attachmentSection.classList.remove('hidden');

    var li = document.createElement('li');
    var img = new Image();
    img.src = window.URL.createObjectURL(blob);
    img.onclick = showAttachment;

    li.appendChild(img);
    attachmentsList.appendChild(li);

    document.querySelector('#attach-button').classList.add('hidden');
  }

  function showAttachment() {
    notesAttachmentView.classList.remove('view-hidden');
    notesAttachmentView.classList.add('view-visible');
    notesListView.classList.remove('view-visible');
    notesListView.classList.add('view-hidden');

    renderAttachment();
  }

  function renderAttachment() {
    attachmentContainer.innerHTML = '';

    var imgNode = new Image();
    imgNode.id = 'theImage';
    imgNode.src = window.URL.createObjectURL(noteAttachment);

    imgNode.onload = function() {
      setImageDimensions(imgNode);
      attachmentContainer.appendChild(imgNode);
    };
  }

  function setImageDimensions(imgNode) {
    window.console.log('Dimensions: ' + window.innerWidth + window.innerHeight);
    var availableHeight = window.innerHeight -
      notesAttachmentView.querySelector(
                                  '#notes-attachment-header').clientHeight;
    window.console.log('Available height: ' + availableHeight);

    var relX = window.innerWidth / imgNode.naturalWidth;
    var relY = availableHeight / imgNode.naturalHeight;

    var minRel = Math.min(relX, relY);
    imgNode.width = imgNode.naturalWidth * minRel;
    window.console.log('Img Node Width: ' + imgNode.width);
    imgNode.height = imgNode.naturalHeight * minRel;
    window.console.log('Img Node Height: ' + imgNode.height);

    if (imgNode.height < availableHeight) {
      imgNode.style.top = (availableHeight - imgNode.height) / 2 + 'px';
    }
    else {
      imgNode.style.top = '0px';
    }
  }

  function onDeleteNote() {
    var noteId = Number(getFormData().id);

    deleteNote(noteId).then(onNoteSaved, () => alert('error'));
  }

  function onEditNote(e) {
    resetAttachment();

    var uid = e.target.dataset.uid;

    if (!uid) {
      uid = e.target.parentNode.dataset.uid;
    }

    uid = Number(uid);

    cloudDatastore.get(uid).then(function(note) {
      note.id = uid;
      editNote(note);
    }, () => alert('error'));
  }

  function editNote(note) {
    showForm();
    document.querySelector('#notes-form-header > h1').textContent = 'Edit Note';
    notesFormView.dataset.mode = 'edit';

    var formData = document.querySelector('form').elements;
    formData['title'].value = note.title;
    formData['text-data'].value = note.body;
    formData['noteId'].value = note.id;

    noteAttachment = note.attachment;
    attachmentThumbnail = note.attachmentThumbnail;
    buildAttachment(attachmentThumbnail || noteAttachment);
  }

  function onSaveNote() {
    if (notesFormView.dataset.mode === 'edit') {
      updateNote().then(onNoteSaved, () => alert('error'));
      return;
    }
    addNote().then(onNoteSaved, () => alert('error'));
  }

  function onNoteSaved() {
    renderList();
    backToList(notesFormView);
  }

  function clearNotesIds() {
    return new Promise(function(resolve, reject) {
      asyncStorage.setItem('notesList', null, resolve, reject);
    });
  }

  function clearMobileId() {
    return new Promise(function(resolve, reject) {
      asyncStorage.setItem('mobileIdData', null, resolve, reject);
    });
  }

  function clearNotes() {
    return clearNotesIds().then(function() {
      return cloudDatastore.clear();
    }).then(function() {
        return clearMobileId();
    });
  }

  function onResetNotes() {
    clearNotes().then(() => notesListElement.innerHTML = '',
                      () => alert('error'));
    backToList(notesSettingsView);
  }

  function addNote() {
    var formData = getFormData();
    return cloudDatastore.add(formData.note).then(function(newId) {
      console.log('Added: ', newId);
      return addNoteId(newId);
    });
  }

  function updateNote() {
    var formData = getFormData();
    return cloudDatastore.put(formData.note, Number(formData.id));
  }

  function deleteNote(noteId) {
    return cloudDatastore.remove(noteId).then(function() {
      return removeNoteId(noteId);
    });
  }

  function removeNoteId(noteId) {
    return new Promise(function(resolve, reject) {
      asyncStorage.getItem('notesList', function onListReady(list) {
        var index = list.indexOf(noteId);
        if (index === -1) {
          reject('not found');
          return;
        }
        list.splice(index, 1);
        asyncStorage.setItem('notesList', list, resolve, reject);
      });
    });
  }

  function addNoteId(noteId) {
    return new Promise(function(resolve, reject) {
      asyncStorage.getItem('notesList', function onListReady(list) {
        var newList = list || [];
        newList.push(noteId);
        asyncStorage.setItem('notesList', newList, resolve, reject);
      });
    });
  }

  function getFormData() {
    var formData = document.querySelector('form').elements;
    return {
      note: {
        title: formData['title'].value,
        body: formData['text-data'].value,
        attachment: noteAttachment,
        attachmentThumbnail: attachmentThumbnail
      },
      id: formData['noteId'].value
    }
  }

  function renderList() {
    notesListElement.innerHTML = '';
    window.asyncStorage.getItem('notesList', function listReady(list) {
      if (!Array.isArray(list) || list.length === 0) {
        return;
      }
      datastore.get.apply(datastore, list).then(function(notes) {
        var notesList = Array.isArray(notes) ? notes : [notes];
        notesList.forEach(function(aNote, index) {
          aNote.id = list[index];
          var noteListNode = buildListNode(aNote);
          notesListElement.appendChild(noteListNode);
        })
      });
    });
  }

  function buildListNode(aNote) {
    var li = document.createElement('li');
    li.innerHTML = '<p>' + '<strong>' + aNote.title + '</strong>' +
                    ': ' + aNote.body +  '</p>';
    li.dataset.uid = aNote.id;

    return li;
  }

  function resetAttachment() {
    noteAttachment = null;
    attachmentThumbnail = null;

    document.querySelector('#attach-button').classList.remove('hidden');
    document.querySelector('#attachments-list').innerHTML = '';
    document.querySelector('#attachment-section').classList.add('hidden');
  }

  function onNewNote() {
    resetAttachment();
    document.querySelector('#notes-form-header > h1').textContent = 'Add Note';
    showForm();

    document.querySelector('form').reset();
    notesFormView.dataset.mode = 'add';
  }

  function showForm() {
    notesFormView.classList.remove('view-hidden');
    notesFormView.classList.add('view-visible');
    notesListView.classList.remove('view-visible');
    notesListView.classList.add('view-hidden');
  }

  function backToList(originalView) {
    document.body.classList.remove('theme-settings');
    document.body.classList.add('theme-productivity');

    notesListView.classList.remove('view-hidden');
    notesListView.classList.add('view-visible');
    originalView.classList.remove('view-visible');
    originalView.classList.add('view-hidden');
  }

  function backToDetail() {
    document.body.classList.remove('theme-media');
    document.body.classList.add('theme-productivity');

    notesFormView.classList.remove('view-hidden');
    notesFormView.classList.add('view-visible');
    notesAttachmentView.classList.remove('view-visible');
    notesAttachmentView.classList.add('view-hidden');
  }

  function showSettings() {
    window.asyncStorage.getItem('mobileIdData', function(data) {
      document.querySelector('#logged-as').textContent = data && data.msisdn;
    });
    document.body.classList.remove('theme-productivity');
    document.body.classList.add('theme-settings');

    notesSettingsView.classList.remove('view-hidden');
    notesSettingsView.classList.add('view-visible');
    notesListView.classList.remove('view-visible');
    notesListView.classList.add('view-hidden');
  }

  function start(token) {
    init(token).then(renderList, () => alert('error'));
  }

  function init(token) {
    if (cloudDatastore) {
      return Promise.resolve();
    }

    return new Promise(function(resolve, reject) {
      navigator.getDataStores('myDatastore').then(function(list) {
        console.log('Got datastore: ', list[0]);
        datastore = list[0];
        cloudDatastore = new CloudDatastore(datastore, token);
        resolve();
      }, reject);
    });
  }

  return {
    'start': start
  }

})();
