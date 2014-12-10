CloudDatastore
==============

Original idea and implementation: José Manuel Cantera Fonseca (jmcf@tid.es)
Copyright (c) 2014 Telefónica Investigación y Desarrollo (S.A.U.)

CloudDatastore is an experimental technology intended to create a data layer for mobile web
applications. The persistence of such a data layer is managed both locally and in the cloud. As a result,
applications can work seamlessly in offline or online mode. Furthermore, as data will not be confined to a
single device, users will be able to get access to their data from any device.

The initial implementation is based on Mozilla's
[Datastore](https://developer.mozilla.org/en-US/docs/Web/API/Data_Store_API)
technology for Firefox OS. Currently the Datastore API is only available for
Firefox OS certified applications, but we intend to support a regular
[IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API) as well.
To manage authentication, We plan to support
multiple authentication systems, but the initial implementation is using Firefox OS
[MobileId](https://wiki.mozilla.org/WebAPI/MobileIdentity).

The main advantage of this technology is that data is synchronized to the cloud transparently to developers.
From a developer's perspective, they only have to use a regular Firefox OS IndexedDB or Datastore. How the data is synchronized
to the Cloud it is totally up to the CloudDatastore technology.

Furthermore, in the future we are planning to integrate the Firefox OS
[Push](https://developer.mozilla.org/en-US/docs/Web/API/Simple_Push_API)
technology, allowing to trigger spontaneous data synchronizations.

CloudDatastore is composed by the following artefacts:

* Javascript library in charge of synchronizing the data to the Cloud
* Server Backend based on Node.js, Express, Redis and an Object Storage service provided by Telefónica.
* CloudNotes, a Firefox OS Application used to experiment and drive the development of the technology.

The architecture of an application making use of this technology is depicted below:

![alt tag](https://raw.github.com/jmcanterafonseca/CloudDatastore/master/CloudDatastore.png)
