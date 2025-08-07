# [![Contributors][contributors-shield]][contributors-url]

[![Forks][forks-shield]][forks-url]
[![Stargazers][stars-shield]][stars-url]
[![Issues][issues-shield]][issues-url]
[![GPL License][license-shield]][license-url]

[![Readme in English](https://img.shields.io/badge/Readme-English-blue)](README.md)
[![Readme in English](https://img.shields.io/badge/Readme-Turkish-blue)](README-Turkish.md)

<div align="center">  
<a href="https://mono.net.tr/">  
  <img src="https://monobilisim.com.tr/images/mono-bilisim.svg" width="340"/>  
</a>

<h2 align="center">Zabbix plugin for Grafana</h2>
<b>Zabbix plugin for Grafana</b> is a plugin developed to integrate the Zabbix monitoring system with Grafana. This plugin enables visualization of Zabbix data in Grafana dashboards and provides comprehensive monitoring solutions.

</div>

---

## Table of Contents

* [Requirements](#requirements)
* [Quick Start](#quick-start)
* [Makefile Configuration](#makefile-configuration)
* [Kubernetes Installation](#kubernetes-installation)
* [References](#references)
* [License](#license)

---

## Requirements

#### Node.js >= 22
* If you want to install from package manager, download `nodejs` and `npm` packages.
* If the desired version is not available in the package manager, you can install `nodejs` and `npm` with this command:

  ```sh
  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash && source $HOME/.bashrc && nvm install --lts
  ```

#### Golang >= 1.17
* If your distribution doesn't provide version 1.17 or higher, you can install the latest version using the method from [Go's official website](https://go.dev/doc/install).

#### yarn >= 1.22
* Install the `yarn` package with this command after installing `npm`:

  ```sh
  npm install -g yarn
  ```

#### mage >= 1.15
* Install the `mage` package with this command after installing `Golang`: 

  ```sh
  go install github.com/magefile/mage@latest
  ```

#### make >= 4.1
#### zip >= 3.0

---

## Quick Start

1. **Move the project folder to the Grafana plugins directory:**
   
   Usually `/var/lib/grafana/plugins` or the directory defined in docker-compose.yml for Docker Compose users.

2. **Install dependencies:**

   ```sh
   yarn install
   ```

3. **Configure the Makefile:**
   
   The `make all` command by default calls `systemctl restart grafana-server.service`.

4. **Build and install the plugin:**

   ```sh
   make all
   ```

---

## Makefile Configuration

**Grafana with Systemd (default):**
The Makefile is configured to use `systemctl restart grafana-server.service`.

**Grafana with Docker Compose V2:**
Make the following change in the Makefile:
```makefile
cd /path/to/docker-compose.yml && docker compose down; docker compose up -d
```

**Grafana with Docker Compose V1:**
Make the following change in the Makefile:
```makefile
cd /path/to/docker-compose.yml && docker-compose down; docker-compose up -d
```

---

## Kubernetes Installation

When installing using the grafana/grafana `helm` chart

values.yaml

```yaml 
plugins:
  - https://github.com/monobilisim/grafana-zabbix/releases/download/v5.0.4/alexanderzobnin-zabbix-app-linux-amd64.zip;alexanderzobnin-zabbix-app

grafana.ini:
  plugins:
    enabled: true
    allow_loading_unsigned_plugins: alexanderzobnin-zabbix-app,alexanderzobnin-zabbix-datasource,alexanderzobnin-zabbix-triggers-panel
```

---

## References

* Original plugin https://github.com/grafana/grafana-zabbix

---

## License

This project is distributed under the Apache License Version 2.0. See the [LICENSE](LICENSE) file for details.

---

[contributors-shield]: https://img.shields.io/github/contributors/monobilisim/grafana-zabbix.svg?style=for-the-badge
[contributors-url]: https://github.com/monobilisim/grafana-zabbix/graphs/contributors
[forks-shield]: https://img.shields.io/github/forks/monobilisim/grafana-zabbix.svg?style=for-the-badge
[forks-url]: https://github.com/monobilisim/grafana-zabbix/network/members
[stars-shield]: https://img.shields.io/github/stars/monobilisim/grafana-zabbix.svg?style=for-the-badge
[stars-url]: https://github.com/monobilisim/grafana-zabbix/stargazers
[issues-shield]: https://img.shields.io/github/issues/monobilisim/grafana-zabbix.svg?style=for-the-badge
[issues-url]: https://github.com/monobilisim/grafana-zabbix/issues
[license-shield]: https://img.shields.io/github/license/monobilisim/grafana-zabbix.svg?style=for-the-badge
[license-url]: https://github.com/monobilisim/grafana-zabbix/blob/master/LICENSE
