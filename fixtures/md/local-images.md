# Local images relative to the file

![In a subfolder](assets/sample.svg)

![With ./ prefix](./assets/pixel.png)

![Encoded space](assets/with%20space.svg)

The next two must not load: one escapes the document folder, one is an absolute path.

<img id="outside" src="../assets/outside.svg" alt="outside">
<img id="absolute" src="/etc/hosts" alt="absolute">
