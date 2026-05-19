/* global cockpit */
(function(){
	"use strict";
	const E = id => document.getElementById(id);
	let channel = null;
	let checkUrls = [];
	let translations = {};
	let currentLang = "en";

	// Простая система локализации
	function loadTranslations(lang) {
		const path = `po/${lang}.json`;
		return new Promise((resolve) => {
			cockpit.file(path).read()
				.done((content) => {
					translations = JSON.parse(content);
					currentLang = lang;
					applyTranslations();
					resolve(true);
				})
				.fail(() => {
					// Fallback to English
					if (lang !== "en") {
						cockpit.file("po/en.json").read()
							.done((content) => {
								translations = JSON.parse(content);
								currentLang = "en";
								applyTranslations();
							})
							.always(() => resolve(false));
					} else {
						resolve(false);
					}
				});
		});
	}

	function t(key) {
		return translations[key] || key;
	}

	function applyTranslations() {
		document.querySelectorAll("[data-i18n]").forEach(el => {
			const key = el.getAttribute("data-i18n");
			if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") {
				el.placeholder = t(key);
			} else {
				el.textContent = t(key);
			}
		});
		document.querySelectorAll("[data-i18n-title]").forEach(el => {
			el.title = t(el.getAttribute("data-i18n-title"));
		});
		document.querySelectorAll("[data-i18n-placeholder]").forEach(el => {
			el.placeholder = t(el.getAttribute("data-i18n-placeholder"));
		});
	}

	function addLog(msg, type="info") {
		const log = E("logArea");
		const time = new Date().toLocaleTimeString();
		const color = type==="error" ? "#f55" : "#0f0";
		log.innerHTML += `<div style="color:${color}">[${time}] ${msg}</div>`;
		log.scrollTop = log.scrollHeight;
	}

	function show(msg, type="info"){
		const b = E("statusBar"); b.style.display="block"; b.className=`pf-v5-c-alert pf-m-inline pf-m-${type}`;
		E("statusText").textContent = msg;
		addLog(msg, type);
		if(type==="success") setTimeout(()=>b.style.display="none", 5000);
	}

	function renderUrls(){
		const l = E("urlList"); l.innerHTML="";
		checkUrls.forEach((u,i)=>{
			const d = document.createElement("div"); d.className="url-item";
			d.innerHTML = `<span>${u}</span><button class="pf-v5-c-button pf-m-link" data-i="${i}">✕</button>`;
			d.querySelector("button").onclick = ()=>{ checkUrls.splice(i,1); renderUrls(); };
			l.appendChild(d);
		});
	}

	function load(){
		// Определяем язык Cockpit
		const cockpitLang = cockpit.language?.split("-")[0] || "en";
		const supportedLangs = ["en", "ru"];
		const lang = supportedLangs.includes(cockpitLang) ? cockpitLang : "en";
		
		loadTranslations(lang).then(() => {
			channel = cockpit.channel({payload:"proxy-manager", command:"get-config"});
			channel.addEventListener("message", (ev, data)=>{
				const c = JSON.parse(data);
				E("pType").value = c.type || "http";
				E("pEnabled").checked = !!c.enabled;
				E("pHost").value = c.host || "";
				E("pPort").value = c.port || 3128;
				E("pUser").value = c.username || "";
				E("pPass").value = c.password || "";
				E("pNoProxy").value = c.no_proxy || "";
				checkUrls = c.check_urls || []; renderUrls();
				
				// Проверка установленных пакетов
				const pkgs = c.packages || {};
				if (!pkgs.packagekit) { E("tPkg").disabled = true; E("tPkg").parentElement.classList.add("disabled-row"); }
				if (!pkgs.curl) { E("tCurl").disabled = true; E("tCurl").parentElement.classList.add("disabled-row"); }
				
				const missing = (!pkgs.packagekit || !pkgs.curl);
				E("pkgWarning").style.display = missing ? "block" : "none";
				if(missing) addLog("Some packages are not installed. Settings for them are disabled.", "error");
				
				E("tApt").checked = c.targets?.apt ?? true;
				E("tPkg").checked = pkgs.packagekit ? (c.targets?.packagekit ?? true) : false;
				E("tCurl").checked = pkgs.curl ? (c.targets?.curl ?? true) : false;
				E("tSys").checked = c.targets?.system ?? true;
				E("mEnabled").checked = !!c.monitor_enabled;
				E("mInterval").value = c.monitor_interval || 60;
				
				addLog("Configuration loaded.");
			});
			channel.close();
		});
	}

	function collect(){
		return {
			enabled: E("pEnabled").checked,
			type: E("pType").value,
			host: E("pHost").value.trim(),
			port: parseInt(E("pPort").value),
			username: E("pUser").value.trim(),
			password: E("pPass").value,
			no_proxy: E("pNoProxy").value,
			check_urls: checkUrls,
			monitor_enabled: E("mEnabled").checked,
			monitor_interval: parseInt(E("mInterval").value) || 60,
			targets: { apt: E("tApt").checked, packagekit: E("tPkg").checked, curl: E("tCurl").checked, system: E("tSys").checked }
		};
	}

	function sendCmd(cmd, cfg){
		addLog(`Sending command: ${cmd}...`, "info");
		channel = cockpit.channel({payload:"proxy-manager", command:cmd, config:cfg});
		channel.addEventListener("message", (ev, data)=>{
			const r = JSON.parse(data);
			show(r.message, r.success?"success":"danger");
		});
		channel.close();
	}

	E("btnTest").onclick = ()=> sendCmd("test-proxy", collect());
	E("btnApply").onclick = ()=> sendCmd("apply-config", collect());
	E("btnDisable").onclick = ()=> sendCmd("disable-proxy", null);

	E("addUrlBtn").onclick = ()=>{
		const v = E("newUrl").value.trim();
		if(v && !checkUrls.includes(v)){ checkUrls.push(v); renderUrls(); E("newUrl").value=""; }
	};

	cockpit.transport.wait(()=>load());
})();
