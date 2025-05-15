all: install build lint package restart
restart:
	docker compose -f /opt/grafana/docker-compose.yml down && \
	docker compose -f /opt/grafana/docker-compose.yml up -d

# Install dependencies
install:
	# Frontend
	yarn install --pure-lockfile
	# Backend
	go install -v ./pkg/
	go install golang.org/x/lint/golint@latest

deps-go:
	go install -v ./pkg/

build: build-frontend build-backend
build-frontend:
	yarn build

build-backend:
	mage -v build:backend
build-debug:
	mage -v build:debug

run-frontend:
	yarn install --pure-lockfile
	yarn dev

run-backend:
	# Rebuilds plugin on changes and kill running instance which forces grafana to restart plugin
	# See .bra.toml for bra configuration details
	bra run

# Build plugin for all platforms (ready for distribution)
dist: dist-frontend dist-backend
dist-frontend:
	yarn build

dist-backend: dist-backend-mage
dist-backend-mage:
	mage -v buildAll
dist-backend-%:
	$(eval filename = gpx_zabbix-plugin_$*_amd64$(extension))
	env CGO_ENABLED=0 GOOS=$* GOARCH=amd64 go build -ldflags="-s -w" -o ./dist/$(filename) ./pkg

.PHONY: clean
clean:
	-rm -r ./dist/

.PHONY: lint
lint:
	yarn lint
	golint -min_confidence=1.1 -set_exit_status pkg/...

sign-package:
	yarn sign

package: install dist

zip:
	cp -r dist/ alexanderzobnin-zabbix-app
	zip -r alexanderzobnin-zabbix-app.zip alexanderzobnin-zabbix-app
	rm -rf alexanderzobnin-zabbix-app
