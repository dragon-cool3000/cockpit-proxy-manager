/* global cockpit */
(function() {
	"use strict";

	// Исправлен синтаксис стрелочных функций (убраны пробелы перед >)
	const $ = id => document.getElementById(id);
	const $$ = (sel, ctx = document) => ctx.querySelectorAll(sel);

	// Убраны пробелы в конце строк (было: "127.0.0.1,... ")
	const DEFAULT_NO_PROXY = "127.0.0.1,localhost,::1,10.0.0.0/8,172.16.0.0/12,192.168.0.0/16,fc00::/7,fe80::/10";
	const DEFAULT_CHECK_URLS = [
		"http://connect.rom.miui.com/generate_204",
		"http://connectivitycheck.platform.hicloud.com/generate_204",
		"http://www.qualcomm.cn/generate_204",
		"http://captcha.qq.com/generate_204"
	];

	let checkUrls = [...DEFAULT_CHECK_URLS];
	let translations = {};
	let backendConnected = false;

	function loadTranslations(lang) {
		const path = `po/${lang}.json`;
		return new Promise((resolve) => {
			cockpit.file(path).read()
				.done((content) => {
					try { translations = JSON.parse(content || "{}"); } catch(e) {}
					applyTranslations();
					resolve(true);
				})
				.fail(() => {
					if (lang !== "en") {
						cockpit.file("po/en.json").read()
							.done((content) => {
								try { translations = JSON.parse(content || "{}"); } catch(e) {}
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
		const str = (translations && translations[key]) ? translations[key] : key;
		return args.length ? str.replace(/%s/g, () => args.shift()) : str;
	}

	function applyTranslations() {
		if (!translations) return;
		$$("[data-i18n]").forEach(el => {
			const key = el?.getAttribute("data-i18n");
			if (key && el && translations[key]) el.textContent = translations[key];
		});
		$$("[data-i18n-placeholder]").forEach(el => {
			const key = el?.getAttribute("data-i18n-placeholder");
			if (key && el && translations[key]) el.setAttribute("placeholder", translations[key]);
		});
	}

	function addLog(msg, type = "info") {
		const log = $("logArea");
		if (!log) return;
		const time = new Date().toLocaleTimeString();
		const entry = document.createElement("div");
		entry.className = `logEntry ${type}`;
		entry.textContent = `[${time}] ${msg}`;
		log.appendChild(entry);
		log.scrollTop = log.scrollHeight;
		console.log(`[proxy.js] ${type.toUpperCase()}: ${msg}`);
	}

	function showStatus(msg, type = "info") {
		const bar = $("statusBar");
		if (!bar) return;
		bar.className = `status-bar pf-v5-c-alert pf-m-inline pf-m-${type}`;
		bar.style.display = "block";
		const text = $("statusText");
		if (text) text.textContent = msg;
		addLog(msg, type);
		if (type === "success") {
			setTimeout(() => { bar.style.display = "none"; }, 5000);
		}
	}

	function renderUrls() {
		const list = $("urlList");
		if (!list) return;
		list.innerHTML = "";
		(checkUrls || []).forEach((url, i) => {
			const item = document.createElement("div");
			item.className = "urlItem";
			item.innerHTML = `<span>${url}</span><button type="button" class="pf-v5-c-button pf-m-plain pf-m-sm" data-idx="${i}">✕</button>`;
			item.querySelector("button").onclick = () => { checkUrls.splice(i, 1); renderUrls(); };
			list.appendChild(item);
		});
	}

	function populateUI(cfg) {
		cfg = cfg || {};

		if ($("pType")) $("pType").value = cfg.type || "http";
		if ($("pHost")) $("pHost").value = cfg.host || "";
		if ($("pPort")) $("pPort").value = cfg.port || 3128;
		if ($("pUser")) $("pUser").value = cfg.username || "";

		if ($("pNoProxy")) {
			const val = cfg.no_proxy;
			$("pNoProxy").value = (val && val.trim()) ? val : DEFAULT_NO_PROXY;
		}

		const urls = cfg.check_urls;
		if (Array.isArray(urls) && urls.length > 0) {
			checkUrls = [...urls];
		} else {
			checkUrls = [...DEFAULT_CHECK_URLS];
		}
		renderUrls();

		if ($("mEnabled")) $("mEnabled").checked = !!cfg.monitor_enabled;
		if ($("mInterval")) $("mInterval").value = cfg.monitor_interval || 60;

		const pkgs = cfg.packages || {};
		const targets = cfg.targets || {};

		if ($("tApt")) $("tApt").checked = !!targets.apt;
		updateAppStatus("apt", (cfg.enabled && targets.apt) ? "ok" : "disabled");

		if (!pkgs.packagekit && $("tPkg")) {
			$("tPkg").disabled = true;
			$("tPkg").checked = false;
			updateAppStatus("packagekit", "missing");
		} else if ($("tPkg")) {
			$("tPkg").disabled = false;
			$("tPkg").checked = !!targets.packagekit;
			updateAppStatus("packagekit", (cfg.enabled && targets.packagekit) ? "ok" : "disabled");
		}

		if (!pkgs.curl && $("tCurl")) {
			$("tCurl").disabled = true;
			$("tCurl").checked = false;
			updateAppStatus("curl", "missing");
		} else if ($("tCurl")) {
			$("tCurl").disabled = false;
			$("tCurl").checked = !!targets.curl;
			updateAppStatus("curl", (cfg.enabled && targets.curl) ? "ok" : "disabled");
		}

		if ($("tSys")) $("tSys").checked = !!targets.system;
		updateAppStatus("system", (cfg.enabled && targets.system) ? "ok" : "disabled");

		addLog("Configuration loaded.");
	}

	function updateAppStatus(app, status) {
		const badge = $(`status-${app}`);
		if (!badge) return;
		const map = {
			ok: { cls: "pf-m-green", txt: "● OK" },
			failed: { cls: "pf-m-red", txt: "⚠ Failed" },
			disabled: { cls: "pf-m-grey", txt: "○ Disabled" },
			missing: { cls: "pf-m-grey", txt: "○ Not installed" }
		};
		const s = map[status] || map.disabled;
		badge.className = `pf-v5-c-label statusBadge ${s.cls}`;
		badge.textContent = s.txt;
	}

	function collectGlobal() {
		return {
			type: $("pType")?.value || "http",
			enabled: $("pEnabled")?.checked || false,
			host: $("pHost")?.value?.trim() || "",
			port: parseInt($("pPort")?.value) || 3128,
			username: $("pUser")?.value?.trim() || "",
			password: $("pPass")?.value || "",
			no_proxy: $("pNoProxy")?.value || DEFAULT_NO_PROXY,
			check_urls: checkUrls?.length ? checkUrls : [...DEFAULT_CHECK_URLS],
			monitor_enabled: $("mEnabled")?.checked || false,
			monitor_interval: parseInt($("mInterval")?.value) || 60
		};
	}

	// === ИСПРАВЛЕННАЯ ЛОГИКА ОТПРАВКИ КОМАНД ===
	function sendCmd(cmd, payload, onSuccess, onError) {
		// payload указывает мосту, какой spawn-процесс запустить
		// command НЕ передается здесь, иначе будет ошибка not-supported
		const ch = cockpit.channel({ payload: "proxy-manager" });
		let handled = false;

		ch.addEventListener("message", (ev, data) => {
			if (handled) return;
			try {
				const res = JSON.parse(data);
				handled = true;
				if (res.success !== undefined) {
					if (res.success && onSuccess) onSuccess(res);
					else if (!res.success && onError) onError(res);
				} else if (onSuccess) {
					onSuccess(res);
				}
			} catch (e) {
				addLog(`Parse error: ${e}`, "error");
			}
		});

		ch.addEventListener("close", (ev, opts) => {
			if (!handled && opts.problem) {
				if (opts.problem === "not-supported") {
					if (!backendConnected) {
						addLog("⚠️ Backend not connected. Using local defaults.", "warning");
						backendConnected = false;
					}
				} else {
					addLog(`Channel closed: ${opts.problem}`, "error");
				}
				if (onError) onError({ message: opts.problem });
			}
		});

		// Команда передается в теле JSON в stdin процесса
		ch.send(JSON.stringify({ command: cmd, ...payload }));
		return ch;
	}

	function initChannel() {
		sendCmd("get-config", {},
			(cfg) => {
				backendConnected = true;
				populateUI(cfg);
			},
			() => {
				if (!backendConnected) {
					populateUI({});
				}
			}
		);
	}

	function initSplitPane() {
		const divider = $("divider");
		const settings = $("settingsPane");
		const log = $("logPane");

		if (!divider || !settings || !log) return;

		settings.style.flex = "3";
		log.style.flex = "1";

		let isDragging = false;

		divider.addEventListener("mousedown", function(e) {
			isDragging = true;
			document.body.style.cursor = "row-resize";
			document.body.style.userSelect = "none";
			e.preventDefault();
		});

		document.addEventListener("mousemove", function(e) {
			if (!isDragging) return;

			const container = document.getElementById("mainContainer");
			const containerRect = container.getBoundingClientRect();
			const relativeY = e.clientY - containerRect.top;

			const minH = 100;
			const maxH = containerRect.height - 100;
			let adjustedY = relativeY;
			if (adjustedY < minH) adjustedY = minH;
			if (adjustedY > maxH) adjustedY = maxH;

			const topH = adjustedY;
			const bottomH = containerRect.height - topH;
			
			if (bottomH > 0) {
				const flexRatio = topH / bottomH;
				settings.style.flex = flexRatio;
				log.style.flex = "1";
			}
		});

		document.addEventListener("mouseup", function() {
			if (isDragging) {
				isDragging = false;
				document.body.style.cursor = "";
				document.body.style.userSelect = "";
			}
		});
	}

	function setupButtons() {
		$("btnResync")?.addEventListener("click", () => {
			addLog("→ resync-config", "info");
			sendCmd("resync-config", {},
				(res) => {
					populateUI(res);
					showStatus(res.drift_detected ? t("drift_detected") : t("resync_no_change"),
						res.drift_detected ? "warning" : "success");
				},
				(res) => showStatus(res?.message || "Resync failed", "danger")
			);
		});

		$("addUrlBtn")?.addEventListener("click", () => {
			const val = $("newUrl")?.value?.trim();
			if (val && !checkUrls.includes(val)) {
				checkUrls.push(val);
				renderUrls();
				if ($("newUrl")) $("newUrl").value = "";
			}
		});

		$("btnTest")?.addEventListener("click", () => {
			addLog("→ test-proxy", "info");
			const cfg = { ...collectGlobal(), check_urls: checkUrls };
			sendCmd("test-proxy", { config: cfg },
				(res) => showStatus(t("test_success", res.message), "success"),
				(res) => showStatus(t("test_failed", res.message), "danger")
			);
		});
	}

	cockpit.transport.wait(() => {
		const lang = ["en", "ru"].includes((cockpit.language || "en").split("-")[0]) ? (cockpit.language || "en").split("-")[0] : "en";
		loadTranslations(lang).then(() => {
			initChannel();
		});

		initSplitPane();
		setupButtons();

		populateUI({});
		addLog("Proxy Manager initialized.", "info");
	});
})();
