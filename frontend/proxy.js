/* global cockpit */
(function(){
	"use strict";

	const $ = id => document.getElementById(id);
	const $$ = (sel, ctx=document) => ctx.querySelectorAll(sel);

	let channel = null;
	let checkUrls = [];
	let translations = {};
	let currentLang = "en";
	let config = null;

	// Безопасная локализация
	function loadTranslations(lang) {
		const path = `po/${lang}.json`;
		return new Promise((resolve) => {
			cockpit.file(path).read()
				.done((content) => {
					try {
						translations = JSON.parse(content);
						currentLang = lang;
					} catch (e) {
						console.warn("Failed to parse translations:", e);
					}
					applyTranslations();
					resolve(true);
				})
				.fail(() => {
					if (lang !== "en") {
						cockpit.file("po/en.json").read()
							.done((content) => {
								try { translations = JSON.parse(content); currentLang = "en"; } catch(e) {}
								applyTranslations();
							})
							.always(() => resolve(false));
					} else {
						resolve(false);
					}
				});
		});
	}

	function t(key, ...args) {
		const str = translations[key] || key;
		return args.length ? str.replace(/%s/g, () => args.shift()) : str;
	}

	function applyTranslations() {
		// Текстовые элементы
		$$("[data-i18n]").forEach(el => {
			const key = el.getAttribute("data-i18n");
			if (key && translations[key]) {
				el.textContent = translations[key];
			}
		});
		// Заголовки (title атрибут)
		$$("[data-i18n-title]").forEach(el => {
			const key = el.getAttribute("data-i18n-title");
			if (key && translations[key]) {
				el.setAttribute("title", translations[key]);
			}
		});
		// Placeholder'ы
		$$("[data-i18n-placeholder]").forEach(el => {
			const key = el.getAttribute("data-i18n-placeholder");
			if (key && translations[key]) {
				el.setAttribute("placeholder", translations[key]);
			}
		});
	}

	function addLog(msg, type="info") {
		const log = $("logArea");
		const time = new Date().toLocaleTimeString();
		const color = type==="error" ? "var(--pf-v5-global--danger-color--100)" :
		              type==="warning" ? "var(--pf-v5-global--warning-color--100)" :
		              "var(--pf-v5-global--success-color--100)";
		const entry = document.createElement("div");
		entry.style.color = color;
		entry.textContent = `[${time}] ${msg}`;
		log.appendChild(entry);
		log.scrollTop = log.scrollHeight;
	}

	function showStatus(msg, type="info") {
		const bar = $("statusBar");
		bar.style.display = "block";
		bar.className = `pf-v5-c-alert pf-m-inline pf-m-${type}`;
		$("statusText").textContent = msg;
		addLog(msg, type);
		if (type === "success") {
			setTimeout(() => { bar.style.display = "none"; }, 5000);
		}
	}

	function renderUrls() {
		const list = $("urlList");
		list.innerHTML = "";
		checkUrls.forEach((url, i) => {
			const item = document.createElement("li");
			item.className = "pf-v5-c-list__item";
			item.innerHTML = `
				<span class="pf-v5-u-font-size-sm">${url}</span>
				<button type="button" class="pf-v5-c-button pf-m-plain pf-m-sm" data-idx="${i}" aria-label="Remove">✕</button>
			`;
			item.querySelector("button").onclick = () => {
				checkUrls.splice(i, 1);
				renderUrls();
			};
			list.appendChild(item);
		});
	}

	function updateAppCardStatus(app, status, msg) {
		const card = $(`card-${app}`);
		const badge = $(`status-${app}`);
		if (!card || !badge) return;

		const colors = { ok: "pf-m-green", failed: "pf-m-red", disabled: "pf-m-grey", missing: "pf-m-grey" };
		const icons = { ok: "● OK", failed: "⚠ Failed", disabled: "○ Disabled", missing: "○ Not installed" };

		badge.className = `pf-v5-c-label ${colors[status] || "pf-m-grey"}`;
		badge.textContent = icons[status] || status;
		if (msg) {
			badge.setAttribute("title", msg);
		}
	}

	function populateUI(cfg) {
		config = cfg;
		$("pType").value = cfg.type || "http";
		$("pEnabled").checked = !!cfg.enabled;
		$("pHost").value = cfg.host || "";
		$("pPort").value = cfg.port || (cfg.type === "socks5" ? 1080 : 3128);
		$("pUser").value = cfg.username || "";
		$("pPass").value = cfg.password || ""; // Пароль не сбрасываем при загрузке
		$("pNoProxy").value = cfg.no_proxy || "127.0.0.1,localhost,::1,10.0.0.0/8,172.16.0.0/12,192.168.0.0/16,fc00::/7,fe80::/10";
		checkUrls = cfg.check_urls || [];
		renderUrls();

		// Обновление карточек приложений
		const pkgs = cfg.packages || {};
		const targets = cfg.targets || {};

		// APT (всегда доступен)
		$("tApt").checked = !!targets.apt;
		updateAppCardStatus("apt", cfg.enabled && targets.apt ? "ok" : "disabled");

		// PackageKit
		if (!pkgs.packagekit) {
			$("tPkg").disabled = true;
			$("tPkg").checked = false;
			$("btnApplyPkg").disabled = true;
			$("btnDisablePkg").disabled = true;
			updateAppCardStatus("packagekit", "missing", t("pkg_install_cmd", "packagekit"));
			addLog(`PackageKit not installed. ${t("pkg_install_cmd", "packagekit")}`, "warning");
		} else {
			$("tPkg").disabled = false;
			$("btnApplyPkg").disabled = false;
			$("btnDisablePkg").disabled = false;
			$("tPkg").checked = !!targets.packagekit;
			updateAppCardStatus("packagekit", cfg.enabled && targets.packagekit ? "ok" : "disabled");
		}

		// curl
		if (!pkgs.curl) {
			$("tCurl").disabled = true;
			$("tCurl").checked = false;
			$("btnApplyCurl").disabled = true;
			$("btnDisableCurl").disabled = true;
			updateAppCardStatus("curl", "missing", t("pkg_install_cmd", "curl"));
			addLog(`curl not installed. ${t("pkg_install_cmd", "curl")}`, "warning");
		} else {
			$("tCurl").disabled = false;
			$("btnApplyCurl").
