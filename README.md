# [![Contributors][contributors-shield]][contributors-url]

[![Forks][forks-shield]][forks-url]
[![Stargazers][stars-shield]][stars-url]
[![Issues][issues-shield]][issues-url]
[![GPL License][license-shield]][license-url]

<div align="center">  
<a href="https://mono.net.tr/">  
  <img src="https://monobilisim.com.tr/images/mono-bilisim.svg" width="340"/>  
</a>

<h2 align="center">Zabbix plugin for Grafana</h2>
<b>Zabbix plugin for Grafana</b>, Zabbix izleme sistemini Grafana ile entegre etmek için geliştirilmiş bir eklentidir. Bu eklenti, Zabbix verilerinin Grafana dashboardlarında görselleştirilmesini sağlar ve kapsamlı izleme çözümleri sunar.

</div>

---

## İçindekiler

* [Gereksinimler](#gereksinimler)
* [Hızlı Başlangıç](#hızlı-başlangıç)
* [Makefile Yapılandırması](#makefile-yapılandırması)
* [Kubernetes Üzerine Kurulumu](#kubernetes-üzerine-kurulumu)
* [Referanslar](#referanslar)
* [Lisans](#lisans)

---

## Gereksinimler

#### Node.js >= 22
* Paket yöneticisinden indirilmek istenirse `nodejs` ve `npm` paketlerini indirin.
* Paket yöneticisinde istenilen sürüm bulunmuyor ise bu komut ile `nodejs` ve `npm` indirebilirsiniz:

  ```sh
  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash && source $HOME/.bashrc && nvm install --lts
  ```

#### Golang >= 1.17
* Dağıtımınız 1.17 veya üstü bir sürüm vermiyor ise [Go resmi sitesindeki](https://go.dev/doc/install) yöntemle son sürümü yükleyebilirsiniz.

#### yarn >= 1.22
* `yarn` paketini `npm` kurulduktan sonra bu komut ile indirin:

  ```sh
  npm install -g yarn
  ```

#### mage >= 1.15
* `mage` paketini `Golang`'ı kurduktan sonra bu komut ile indirin: 

  ```sh
  go install github.com/magefile/mage@latest
  ```

#### make >= 4.1
#### zip >= 3.0


---

## Hızlı Başlangıç

1. **Proje klasörünü Grafana eklentileri dizinine taşıyın:**
   
   Genellikle `/var/lib/grafana/plugins` veya Docker Compose kullanıcıları için docker-compose.yml içerisinde tanımlı dizin.

2. **Bağımlılıkları yükleyin:**

   ```sh
   yarn install
   ```

3. **Makefile'ı yapılandırın:**
   
   `make all` komutu varsayılan olarak `systemctl restart grafana-server.service` çağırır.

4. **Eklentiyi derleyin ve yükleyin:**

   ```sh
   make all
   ```
---

---

## Makefile Yapılandırması

**Systemd ile Grafana (varsayılan):**
Makefile `systemctl restart grafana-server.service` kullanacak şekilde yapılandırılmıştır.

**Docker Compose V2 ile Grafana:**
Makefile üzerinde şu değişikliği yapın:
```makefile
cd /path/to/docker-compose.yml && docker compose down; docker compose up -d
```

**Docker Compose V1 ile Grafana:**
Makefile üzerinde şu değişikliği yapın:
```makefile
cd /path/to/docker-compose.yml && docker-compose down; docker-compose up -d
```

---

## Kubernetes Üzerine Kurulumu

grafana/grafana `helm` chart'ı kullanılarak kurulum yapıldığında

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

## Referanslar

* Asıl plugin https://github.com/grafana/grafana-zabbix

---

## Lisans

Bu proje Apache License Version 2.0 lisansı altında dağıtılmaktadır. Detaylar için [LICENSE](LICENSE) dosyasına bakın.

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
