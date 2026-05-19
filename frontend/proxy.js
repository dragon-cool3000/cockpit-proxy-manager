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
			$("btnApplyCurl").disabled = false;
			$("btnDisableCurl").disabled = false;
			$("tCurl").checked = !!targets.curl;
			updateAppCardStatus("curl", cfg.enabled && targets.curl ? "ok" : "disabled");
		}

		// System
		$("tSys").checked = !!targets.system;
		updateAppCardStatus("system", cfg.enabled && targets.system ? "ok" : "disabled");

		// Monitoring
		$("mEnabled").checked = !!cfg.monitor_enabled;
		$("mInterval").value = cfg.monitor_interval || 60;

		addLog("Configuration loaded.");
	}

	function load() {
		const cockpitLang = (cockpit.language || "en").split("-")[0];
		const supported = ["en", "ru"];
		const lang = supported.includes(cockpitLang) ? cockpitLang : "en";

		loadTranslations(lang).then(() => {
			channel = cockpit.channel({ payload: "proxy-manager", command: "get-config" });
			channel.addEventListener("message", (ev, data) => {
				try {
					populateUI(JSON.parse(data));
				} catch (e) {
					addLog(`Failed to parse config: ${e}`, "error");
				}
			});
			channel.addEventListener("close", (ev, opts) => {
				if (opts.problem) {
					addLog(`Backend error: ${opts.problem}`, "error");
				}
			});
		});
	}

	function collectGlobal() {
		return {
			enabled: $("pEnabled").checked,
			type: $("pType").value,
			host: $("pHost").value.trim(),
			port: parseInt($("pPort").value) || ($("pType").value === "socks5" ? 1080 : 3128),
			username: $("pUser").value.trim(),
			password: $("pPass").value,
			no_proxy: $("pNoProxy").value,
			check_urls: checkUrls,
			monitor_enabled: $("mEnabled").checked,
			monitor_interval: parseInt($("mInterval").value) || 60
		};
	}

	function collectTargets() {
		return {
			apt: $("tApt").checked,
			packagekit: $("tPkg").checked && !$("tPkg").disabled,
			curl: $("tCurl").checked && !$("tCurl").disabled,
			system: $("tSys").checked
		};
	}

	function sendCmd(cmd, payload, onSuccess, onError) {
		addLog(`→ ${cmd}`, "info");
		const ch = cockpit.channel({ payload: "proxy-manager", command: cmd, ...payload });
		ch.addEventListener("message", (ev, data) => {
			try {
				const res = JSON.parse(data);
				if (res.success) {
					addLog(`← ${cmd}: ${res.message}`, "success");
					if (onSuccess) onSuccess(res);
				} else {
					addLog(`← ${cmd} failed: ${res.message}`, "error");
					if (onError) onError(res);
				}
			} catch (e) {
				addLog(`Parse error: ${e}`, "error");
			}
		});
		ch.addEventListener("close", (ev, opts) => {
			if (opts.problem && !opts.success) {
				addLog(`Channel closed: ${opts.problem}`, "error");
				if (onError) onError({ message: opts.problem });
			}
		});
	}

	// Test connection
	$("btnTest").onclick = () => {
		const cfg = { ...collectGlobal(), targets: collectTargets() };
		sendCmd("test-proxy", { config: cfg },
			(res) => showStatus(t("test_success", res.message), "success"),
			(res) => showStatus(t("test_failed", res.message), "danger")
		);
	};

	// Apply to specific target
	function applyToTarget(target) {
		const globalCfg = collectGlobal();
		const targets = { apt:false, packagekit:false, curl:false, system:false };
		targets[target] = true;
		const cfg = { ...globalCfg, targets };

		sendCmd("apply-config", { config: cfg },
			(res) => {
				showStatus(t("apply_success", target), "success");
				updateAppCardStatus(target, "ok");
				// Перезагрузка конфигурации для обновления статуса
				cockpit.channel({ payload: "proxy-manager", command: "get-config" })
					.addEventListener("message", (ev, data) => populateUI(JSON.parse(data)));
			},
			(res) => showStatus(t("apply_failed", target, res.message), "danger")
		);
	}

	$("btnApplyApt").onclick = () => applyToTarget("apt");
	$("btnApplyPkg").onclick = () => applyToTarget("packagekit");
	$("btnApplyCurl").onclick = () => applyToTarget("curl");
	$("btnApplySys").onclick = () => applyToTarget("system");
	$("btnApplyAll").onclick = () => {
		const cfg = { ...collectGlobal(), targets: collectTargets() };
		sendCmd("apply-config", { config: cfg },
			(res) => {
				showStatus(t("apply_success", "selected targets"), "success");
				["apt","packagekit","curl","system"].forEach(t => {
					if (collectTargets()[t]) updateAppCardStatus(t, "ok");
				});
			},
			(res) => showStatus(res.message, "danger")
		);
	};

	// Disable specific target
	function disableTarget(target) {
		sendCmd("disable-proxy", { target },
			(res) => {
				showStatus(t("disable_success", target), "success");
				updateAppCardStatus(target, "disabled");
			},
			(res) => showStatus(res.message, "danger")
		);
	}

	$("btnDisableApt").onclick = () => disableTarget("apt");
	$("btnDisablePkg").onclick = () => disableTarget("packagekit");
	$("btnDisableCurl").onclick = () => disableTarget("curl");
	$("btnDisableSys").onclick = () => disableTarget("system");
	$("btnDisableAll").onclick = () => {
		sendCmd("disable-proxy", {},
			(res) => {
				showStatus("All proxies disabled", "success");
				["apt","packagekit","curl","system"].forEach(t => updateAppCardStatus(t, "disabled"));
			},
			(res) => showStatus(res.message, "danger")
		);
	};

	// Resync from system
	$("btnResync").onclick = () => {
		sendCmd("resync-config", {},
			(res) => {
				populateUI(res);
				showStatus(res.drift_detected ? t("drift_detected") : t("resync_no_change"),
					res.drift_detected ? "warning" : "success");
			},
			(res) => showStatus(res.message, "danger")
		);
	};

	// Add URL
	$("addUrlBtn").onclick = () => {
		const val = $("newUrl").value.trim();
		if (val && !checkUrls.includes(val)) {
			checkUrls.push(val);
			renderUrls();
			$("newUrl").value = "";
		}
	};

	// Init
	cockpit.transport.wait(() => {
		load();
		addLog("Proxy Manager initialized.", "info");
	});
})();
