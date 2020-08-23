resource "docker_container" "cluster" {
  name = "${var.name}-node${var.offset + count.index}"
  count = "${var.servers}"
  image = "agoric/vagrant-debian:latest"

  tmpfs {
    "/tmp" = "exec"
    "/run" = ""
  }

  privileged = "true"

  volumes = "${var.volumes}"

  upload {
    content = "${file("${var.ssh_key}")}"
    file = "/root/.ssh/authorized_keys"
  }
}
