# Zabbix plugin for Grafana

# Gereksinimler

### Nodejs >= 22

#### Eğer paket yöneticisi kullanılmayacaksa ve sistem Bash kullanıyor ise `curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash && source $HOME/.bashrc && nvm install --lts`.

#### Eğer paket yönetici kullanılıyorsa `nodejs` paketi içerisinde `npm` yollamaz, dağıtımınız için hangi paket `npm` veriyorsa onu da indirin.

### make >= 4.1

### Golang >= 1.17

#### Eğer dağıtımınız 1.17 veya üstü bir sürüm vermiyor ise adreste bulunan yöntemle son sürümü yükleyebilirsiniz https://go.dev/doc/install.

### yarn >= 1.22

#### Eğer dağıtımınız `yarn` panetine sahip değilse Nodejs ve npm kurulduktan sonra bu komut ile indirebilirsiniz `npm install -g yarn`.

### zip >= 3.0

### mage >= 1.15

#### Eğer golang 1.17 ve üstü kuruluysa bu komut ile `mage` yükleyebilirsiniz `go install github.com/magefile/mage@latest`.

# Kurulum

Proje klasörünü Grafana eklentileri dizinine taşıyın, genellikle `/var/lib/grafana/plugins` veya Docker Compose kullanıcıları için docker-compose.yml içerisinde tanımlı olabilir.

Gereksinimleri indir `yarn install`.

`make all` komutu varsayılan olarak `systemctl restart grafana-server.service` çağırır.

Eğer Grafana Docker Compose V2 ile çalışıyorsa Makefile üzerinde `cd /path/to/docker-compose.yml && docker compose down; docker compose up -d` ile değiştirin.

Eğer Docker Compose V1 kullanılıyorsa `cd /path/to/docker-compose.yml && docker-compose down; docker-compose up -d` ile değiştirin.

`make all` çalıştır
