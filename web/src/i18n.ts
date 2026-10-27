export type Language =
  | "en"
  | "zh-CN"
  | "ko"
  | "es"
  | "fr"
  | "de"
  | "it"
  | "pt"
  | "nl"
  | "pl"
  | "ru"
  | "uk"
  | "ro"
  | "cs"
  | "sv"
  | "nb"
  | "da"
  | "fi"
  | "el"
  | "hu"
  | "bg"
  | "hr"
  | "sr"
  | "sk"
  | "sl"
  | "lt"
  | "lv"
  | "et"
  | "tr";

export const LANGUAGES: { id: Language; label: string }[] = [
  { id: "en", label: "English" },
  { id: "zh-CN", label: "简体中文" },
  { id: "ko", label: "한국어" },
  { id: "es", label: "Español" },
  { id: "fr", label: "Français" },
  { id: "de", label: "Deutsch" },
  { id: "it", label: "Italiano" },
  { id: "pt", label: "Português" },
  { id: "nl", label: "Nederlands" },
  { id: "pl", label: "Polski" },
  { id: "ru", label: "Русский" },
  { id: "uk", label: "Українська" },
  { id: "ro", label: "Română" },
  { id: "cs", label: "Čeština" },
  { id: "sv", label: "Svenska" },
  { id: "nb", label: "Norsk bokmål" },
  { id: "da", label: "Dansk" },
  { id: "fi", label: "Suomi" },
  { id: "el", label: "Ελληνικά" },
  { id: "hu", label: "Magyar" },
  { id: "bg", label: "Български" },
  { id: "hr", label: "Hrvatski" },
  { id: "sr", label: "Srpski" },
  { id: "sk", label: "Slovenčina" },
  { id: "sl", label: "Slovenščina" },
  { id: "lt", label: "Lietuvių" },
  { id: "lv", label: "Latviešu" },
  { id: "et", label: "Eesti" },
  { id: "tr", label: "Türkçe" },
];

const en: Record<string, string> = {
  "nav.sessions": "Sessions",
  "nav.search": "Search",
  "nav.stats": "Stats",
  "nav.terminal": "Terminal",
  "nav.settings": "Settings",
  "nav.users": "Users",
  "nav.extensions": "Extensions",
  "nav.integrations": "Integrations",
  "nav.workspace": "Workspace",
  "nav.opencode": "OpenCode",
  "nav.profiles": "Profiles",
  "ws.title": "Workspace",
  "ws.opencode": "OpenCode",
  "ws.scope": "Configuration scope",
  "ws.snapshots": "Snapshots & backups",
  "ws.subtitle": "Configuration, resources and maintenance for the active opencode installation.",
  "ws.project": "Project",
  "ws.globalOnly": "Global only",
  "ws.overview": "Overview",
  "ws.raw": "Raw config",
  "ws.providers": "Providers",
  "ws.permissions": "Permissions",
  "ws.prompt": "Prompt & rules",
  "ws.code": "LSP & CLI",
  "ws.skills": "Skills",
  "ws.commands": "Commands",
  "ws.agents": "Agents",
  "ws.plugins": "Plugin files",
  "ws.presets": "Presets",
  "ws.profiles": "Config profiles",
  "ws.backup": "Backup & sync",
  "ws.auth": "Provider auth",
  "ws.logs": "Live logs",
  "ws.refresh": "Refresh",
  "ws.save": "Save",
  "ws.cancel": "Cancel",
  "ws.delete": "Delete",
  "ws.create": "Create",
  "ws.loading": "Loading…",
  "ws.overviewTitle": "Workspace overview",
};

const zh: Record<string, string> = {
  "nav.sessions": "会话",
  "nav.search": "搜索",
  "nav.stats": "统计",
  "nav.terminal": "终端",
  "nav.settings": "设置",
  "nav.users": "用户",
  "nav.extensions": "扩展",
  "nav.workspace": "工作区",
  "nav.profiles": "配置档",
  "ws.title": "工作区",
  "ws.subtitle": "管理当前 opencode 安装的配置、资源和维护工具。",
  "ws.project": "项目",
  "ws.globalOnly": "仅全局",
  "ws.overview": "概览",
  "ws.raw": "原始配置",
  "ws.providers": "服务商与模型",
  "ws.permissions": "权限",
  "ws.prompt": "提示词与规则",
  "ws.code": "LSP 与 CLI",
  "ws.skills": "技能",
  "ws.commands": "命令",
  "ws.agents": "代理",
  "ws.plugins": "插件文件",
  "ws.presets": "预设",
  "ws.profiles": "配置档",
  "ws.backup": "备份与同步",
  "ws.auth": "服务商认证",
  "ws.logs": "实时日志",
  "ws.refresh": "刷新",
  "ws.save": "保存",
  "ws.cancel": "取消",
  "ws.delete": "删除",
  "ws.create": "创建",
  "ws.loading": "加载中…",
  "ws.overviewTitle": "工作区概览",
};

const ko: Record<string, string> = {
  "nav.sessions": "세션",
  "nav.search": "검색",
  "nav.stats": "통계",
  "nav.terminal": "터미널",
  "nav.settings": "설정",
  "nav.users": "사용자",
  "nav.extensions": "확장",
  "nav.workspace": "작업 공간",
  "nav.profiles": "프로필",
  "ws.title": "작업 공간",
  "ws.subtitle": "현재 opencode 설치의 구성, 리소스 및 유지 관리를 관리합니다.",
  "ws.project": "프로젝트",
  "ws.globalOnly": "전역만",
  "ws.overview": "개요",
  "ws.raw": "원시 구성",
  "ws.providers": "공급자 및 모델",
  "ws.permissions": "권한",
  "ws.prompt": "프롬프트 및 규칙",
  "ws.code": "LSP 및 CLI",
  "ws.skills": "스킬",
  "ws.commands": "명령",
  "ws.agents": "에이전트",
  "ws.plugins": "플러그인 파일",
  "ws.presets": "프리셋",
  "ws.profiles": "구성 프로필",
  "ws.backup": "백업 및 동기화",
  "ws.auth": "공급자 인증",
  "ws.logs": "실시간 로그",
  "ws.refresh": "새로 고침",
  "ws.save": "저장",
  "ws.cancel": "취소",
  "ws.delete": "삭제",
  "ws.create": "생성",
  "ws.loading": "불러오는 중…",
  "ws.overviewTitle": "작업 공간 개요",
};

const EURO_KEYS = [
  "nav.sessions",
  "nav.search",
  "nav.stats",
  "nav.terminal",
  "nav.settings",
  "nav.users",
  "nav.extensions",
  "nav.workspace",
  "nav.profiles",
  "ws.title",
  "ws.project",
  "ws.globalOnly",
  "ws.overview",
  "ws.raw",
  "ws.providers",
  "ws.permissions",
  "ws.prompt",
  "ws.code",
  "ws.skills",
  "ws.commands",
  "ws.agents",
  "ws.plugins",
  "ws.presets",
  "ws.profiles",
  "ws.backup",
  "ws.auth",
  "ws.logs",
  "ws.refresh",
  "ws.save",
  "ws.cancel",
  "ws.delete",
  "ws.create",
];

// European translations for the navigation and the workspace shell. Missing
// keys/future strings fall back to English in translate().
const EURO: Record<string, string[]> = {
  es: ["Sesiones","Buscar","Estadísticas","Terminal","Ajustes","Usuarios","Extensiones","Espacio de trabajo","Perfiles","Espacio de trabajo","Proyecto","Solo global","Resumen","Configuración sin procesar","Proveedores y modelos","Permisos","Instrucciones y reglas","LSP y CLI","Habilidades","Comandos","Agentes","Archivos de plugins","Preajustes","Perfiles de configuración","Copia y sincronización","Autenticación de proveedores","Registros en vivo","Actualizar","Guardar","Cancelar","Eliminar","Crear"],
  fr: ["Sessions","Rechercher","Statistiques","Terminal","Paramètres","Utilisateurs","Extensions","Espace de travail","Profils","Espace de travail","Projet","Global uniquement","Aperçu","Configuration brute","Fournisseurs et modèles","Autorisations","Invite et règles","LSP et CLI","Compétences","Commandes","Agents","Fichiers de plugins","Préréglages","Profils de configuration","Sauvegarde et synchronisation","Authentification des fournisseurs","Journaux en direct","Actualiser","Enregistrer","Annuler","Supprimer","Créer"],
  de: ["Sitzungen","Suchen","Statistiken","Terminal","Einstellungen","Benutzer","Erweiterungen","Arbeitsbereich","Profile","Arbeitsbereich","Projekt","Nur global","Übersicht","Rohkonfiguration","Anbieter & Modelle","Berechtigungen","Prompt & Regeln","LSP & CLI","Fähigkeiten","Befehle","Agenten","Plugin-Dateien","Voreinstellungen","Konfigurationsprofile","Sicherung & Sync","Anbieter-Authentifizierung","Live-Protokolle","Aktualisieren","Speichern","Abbrechen","Löschen","Erstellen"],
  it: ["Sessioni","Cerca","Statistiche","Terminale","Impostazioni","Utenti","Estensioni","Area di lavoro","Profili","Area di lavoro","Progetto","Solo globale","Panoramica","Configurazione grezza","Provider e modelli","Autorizzazioni","Prompt e regole","LSP e CLI","Competenze","Comandi","Agenti","File dei plugin","Preset","Profili di configurazione","Backup e sincronizzazione","Autenticazione provider","Log in tempo reale","Aggiorna","Salva","Annulla","Elimina","Crea"],
  pt: ["Sessões","Pesquisar","Estatísticas","Terminal","Definições","Utilizadores","Extensões","Área de trabalho","Perfis","Área de trabalho","Projeto","Apenas global","Visão geral","Configuração em bruto","Fornecedores e modelos","Permissões","Prompt e regras","LSP e CLI","Competências","Comandos","Agentes","Ficheiros de plugins","Predefinições","Perfis de configuração","Cópia e sincronização","Autenticação de fornecedores","Registos em direto","Atualizar","Guardar","Cancelar","Eliminar","Criar"],
  nl: ["Sessies","Zoeken","Statistieken","Terminal","Instellingen","Gebruikers","Extensies","Werkruimte","Profielen","Werkruimte","Project","Alleen globaal","Overzicht","Ruwe configuratie","Providers en modellen","Machtigingen","Prompt en regels","LSP en CLI","Vaardigheden","Opdrachten","Agenten","Plugin-bestanden","Voorinstellingen","Configuratieprofielen","Back-up en synchronisatie","Provider-authenticatie","Live logboeken","Vernieuwen","Opslaan","Annuleren","Verwijderen","Aanmaken"],
  pl: ["Sesje","Szukaj","Statystyki","Terminal","Ustawienia","Użytkownicy","Rozszerzenia","Obszar roboczy","Profile","Obszar roboczy","Projekt","Tylko globalne","Przegląd","Surowa konfiguracja","Dostawcy i modele","Uprawnienia","Prompt i reguły","LSP i CLI","Umiejętności","Polecenia","Agenci","Pliki wtyczek","Presety","Profile konfiguracji","Kopia zapasowa i synchronizacja","Uwierzytelnianie dostawców","Dzienniki na żywo","Odśwież","Zapisz","Anuluj","Usuń","Utwórz"],
  ru: ["Сеансы","Поиск","Статистика","Терминал","Настройки","Пользователи","Расширения","Рабочая область","Профили","Рабочая область","Проект","Только глобальные","Обзор","Исходная конфигурация","Провайдеры и модели","Разрешения","Промпт и правила","LSP и CLI","Навыки","Команды","Агенты","Файлы плагинов","Пресеты","Профили конфигурации","Резервное копирование и синхронизация","Авторизация провайдеров","Живые журналы","Обновить","Сохранить","Отмена","Удалить","Создать"],
  uk: ["Сеанси","Пошук","Статистика","Термінал","Налаштування","Користувачі","Розширення","Робочий простір","Профілі","Робочий простір","Проєкт","Лише глобальні","Огляд","Необроблена конфігурація","Постачальники та моделі","Дозволи","Підказка та правила","LSP і CLI","Навички","Команди","Агенти","Файли плагінів","Пресети","Профілі конфігурації","Резервне копіювання та синхронізація","Авторизація постачальників","Живі журнали","Оновити","Зберегти","Скасувати","Видалити","Створити"],
  ro: ["Sesiuni","Căutare","Statistici","Terminal","Setări","Utilizatori","Extensii","Spațiu de lucru","Profiluri","Spațiu de lucru","Proiect","Doar global","Prezentare generală","Configurație brută","Furnizori și modele","Permisiuni","Prompt și reguli","LSP și CLI","Abilități","Comenzi","Agenți","Fișiere plugin","Presetări","Profiluri de configurare","Backup și sincronizare","Autentificare furnizori","Jurnale live","Reîmprospătează","Salvează","Anulează","Șterge","Creează"],
  cs: ["Relace","Hledat","Statistiky","Terminál","Nastavení","Uživatelé","Rozšíření","Pracovní prostor","Profily","Pracovní prostor","Projekt","Pouze globální","Přehled","Surová konfigurace","Poskytovatelé a modely","Oprávnění","Prompt a pravidla","LSP a CLI","Dovednosti","Příkazy","Agenti","Soubory pluginů","Presety","Profily konfigurace","Záloha a synchronizace","Ověřování poskytovatelů","Živé protokoly","Obnovit","Uložit","Zrušit","Smazat","Vytvořit"],
  sv: ["Sessioner","Sök","Statistik","Terminal","Inställningar","Användare","Tillägg","Arbetsyta","Profiler","Arbetsyta","Projekt","Endast globalt","Översikt","Råkonfiguration","Leverantörer och modeller","Behörigheter","Prompt och regler","LSP och CLI","Färdigheter","Kommandon","Agenter","Plugin-filer","Förinställningar","Konfigurationsprofiler","Säkerhetskopiering och synk","Leverantörsautentisering","Live-loggar","Uppdatera","Spara","Avbryt","Ta bort","Skapa"],
  nb: ["Økter","Søk","Statistikk","Terminal","Innstillinger","Brukere","Utvidelser","Arbeidsområde","Profiler","Arbeidsområde","Prosjekt","Kun globalt","Oversikt","Råkonfigurasjon","Leverandører og modeller","Tillatelser","Prompt og regler","LSP og CLI","Ferdigheter","Kommandoer","Agenter","Plugin-filer","Forhåndsinnstillinger","Konfigurasjonsprofiler","Sikkerhetskopi og synk","Leverandørautentisering","Sanntidslogger","Oppdater","Lagre","Avbryt","Slett","Opprett"],
  da: ["Sessioner","Søg","Statistik","Terminal","Indstillinger","Brugere","Udvidelser","Arbejdsområde","Profiler","Arbejdsområde","Projekt","Kun globalt","Oversigt","Råkonfiguration","Udbydere og modeller","Tilladelser","Prompt og regler","LSP og CLI","Færdigheder","Kommandoer","Agenter","Plugin-filer","Forudindstillinger","Konfigurationsprofiler","Backup og synkronisering","Udbydergodkendelse","Live-logfiler","Opdater","Gem","Annuller","Slet","Opret"],
  fi: ["Istunnot","Haku","Tilastot","Pääte","Asetukset","Käyttäjät","Laajennukset","Työtila","Profiilit","Työtila","Projekti","Vain yleiset","Yleiskatsaus","Raakakonfiguraatio","Tarjoajat ja mallit","Käyttöoikeudet","Kehote ja säännöt","LSP ja CLI","Taidot","Komennot","Agentit","Liitännäistiedostot","Esiasetukset","Konfiguraatioprofiilit","Varmuuskopiointi ja synkronointi","Tarjoajan tunnistautuminen","Live-lokit","Päivitä","Tallenna","Peruuta","Poista","Luo"],
  el: ["Συνεδρίες","Αναζήτηση","Στατιστικά","Τερματικό","Ρυθμίσεις","Χρήστες","Επεκτάσεις","Χώρος εργασίας","Προφίλ","Χώρος εργασίας","Έργο","Μόνο καθολικά","Επισκόπηση","Ακατέργαστη διαμόρφωση","Πάροχοι και μοντέλα","Δικαιώματα","Προτροπή και κανόνες","LSP και CLI","Δεξιότητες","Εντολές","Πράκτορες","Αρχεία πρόσθετων","Προεπιλογές","Προφίλ διαμόρφωσης","Αντίγραφα ασφαλείας και συγχρονισμός","Έλεγχος ταυτότητας παρόχων","Ζωντανά αρχεία καταγραφής","Ανανέωση","Αποθήκευση","Άκυρο","Διαγραφή","Δημιουργία"],
  hu: ["Munkamenetek","Keresés","Statisztika","Terminál","Beállítások","Felhasználók","Bővítmények","Munkaterület","Profilok","Munkaterület","Projekt","Csak globális","Áttekintés","Nyers konfiguráció","Szolgáltatók és modellek","Engedélyek","Prompt és szabályok","LSP és CLI","Készségek","Parancsok","Ügynökök","Plugin fájlok","Előbeállítások","Konfigurációs profilok","Biztonsági mentés és szinkronizálás","Szolgáltató hitelesítése","Élő naplók","Frissítés","Mentés","Mégse","Törlés","Létrehozás"],
  bg: ["Сесии","Търсене","Статистика","Терминал","Настройки","Потребители","Разширения","Работно пространство","Профили","Работно пространство","Проект","Само глобални","Преглед","Сурова конфигурация","Доставчици и модели","Разрешения","Подкана и правила","LSP и CLI","Умения","Команди","Агенти","Файлове на плъгини","Предварителни настройки","Профили на конфигурация","Резервно копие и синхронизация","Удостоверяване на доставчици","Живи журнали","Обнови","Запази","Отказ","Изтрий","Създай"],
  hr: ["Sesije","Pretraži","Statistika","Terminal","Postavke","Korisnici","Proširenja","Radni prostor","Profili","Radni prostor","Projekt","Samo globalno","Pregled","Sirova konfiguracija","Pružatelji i modeli","Dopuštenja","Upit i pravila","LSP i CLI","Vještine","Naredbe","Agenti","Datoteke dodataka","Preseti","Profili konfiguracije","Sigurnosna kopija i sinkronizacija","Autentifikacija pružatelja","Živi zapisi","Osvježi","Spremi","Odustani","Izbriši","Stvori"],
  sr: ["Sesije","Pretraga","Statistika","Terminal","Podešavanja","Korisnici","Proširenja","Radni prostor","Profili","Radni prostor","Projekat","Samo globalno","Pregled","Sirova konfiguracija","Provajderi i modeli","Dozvole","Upit i pravila","LSP i CLI","Veštine","Komande","Agenti","Datoteke dodataka","Preseti","Profili konfiguracije","Sigurnosna kopija i sinhronizacija","Autentifikacija provajdera","Živi dnevnici","Osveži","Sačuvaj","Otkaži","Izbriši","Napravi"],
  sk: ["Relácie","Hľadať","Štatistiky","Terminál","Nastavenia","Používatelia","Rozšírenia","Pracovný priestor","Profily","Pracovný priestor","Projekt","Iba globálne","Prehľad","Surová konfigurácia","Poskytovatelia a modely","Oprávnenia","Prompt a pravidlá","LSP a CLI","Zručnosti","Príkazy","Agenti","Súbory pluginov","Predvoľby","Profily konfigurácie","Záloha a synchronizácia","Overenie poskytovateľov","Živé záznamy","Obnoviť","Uložiť","Zrušiť","Odstrániť","Vytvoriť"],
  sl: ["Seje","Iskanje","Statistika","Terminal","Nastavitve","Uporabniki","Razširitve","Delovni prostor","Profili","Delovni prostor","Projekt","Samo globalno","Pregled","Surova konfiguracija","Ponudniki in modeli","Dovoljenja","Poziv in pravila","LSP in CLI","Veščine","Ukazi","Agenti","Datoteke vtičnikov","Prednastavitve","Profili konfiguracije","Varnostna kopija in sinhronizacija","Preverjanje ponudnikov","Dnevniki v živo","Osveži","Shrani","Prekliči","Izbriši","Ustvari"],
  lt: ["Sesijos","Paieška","Statistika","Terminalas","Nustatymai","Vartotojai","Plėtiniai","Darbo sritis","Profiliai","Darbo sritis","Projektas","Tik globalūs","Apžvalga","Neapdorota konfigūracija","Tiekėjai ir modeliai","Leidimai","Užuomina ir taisyklės","LSP ir CLI","Įgūdžiai","Komandos","Agentai","Papildinių failai","Išankstiniai nustatymai","Konfigūracijos profiliai","Atsarginė kopija ir sinchronizavimas","Tiekėjų autentifikavimas","Tiesioginiai žurnalai","Atnaujinti","Išsaugoti","Atšaukti","Ištrinti","Sukurti"],
  lv: ["Sesijas","Meklēt","Statistika","Terminālis","Iestatījumi","Lietotāji","Paplašinājumi","Darbvieta","Profili","Darbvieta","Projekts","Tikai globāli","Pārskats","Neapstrādāta konfigurācija","Pakalpojumu sniedzēji un modeļi","Atļaujas","Uzvedne un noteikumi","LSP un CLI","Prasmes","Komandas","Aģenti","Spraudņu faili","Sagataves","Konfigurācijas profili","Dublējums un sinhronizācija","Pakalpojumu sniedzēju autentifikācija","Tiešsaistes žurnāli","Atjaunot","Saglabāt","Atcelt","Dzēst","Izveidot"],
  et: ["Seansid","Otsi","Statistika","Terminal","Seaded","Kasutajad","Laiendused","Tööruum","Profiilid","Tööruum","Projekt","Ainult globaalne","Ülevaade","Töötlemata konfiguratsioon","Pakkujad ja mudelid","Õigused","Viip ja reeglid","LSP ja CLI","Oskused","Käsud","Agendid","Plugin-failid","Eelseadistused","Konfiguratsiooniprofiilid","Varundus ja sünkroonimine","Pakkuja autentimine","Reaalajas logid","Värskenda","Salvesta","Tühista","Kustuta","Loo"],
  tr: ["Oturumlar","Ara","İstatistikler","Terminal","Ayarlar","Kullanıcılar","Uzantılar","Çalışma alanı","Profiller","Çalışma alanı","Proje","Yalnızca genel","Genel bakış","Ham yapılandırma","Sağlayıcılar ve modeller","İzinler","İstem ve kurallar","LSP ve CLI","Beceriler","Komutlar","Ajanlar","Eklenti dosyaları","Ön ayarlar","Yapılandırma profilleri","Yedekleme ve senkronizasyon","Sağlayıcı kimlik doğrulaması","Canlı günlükler","Yenile","Kaydet","İptal","Sil","Oluştur"],
};

const EURO_MESSAGES: Record<string, Record<string, string>> = Object.fromEntries(
  Object.entries(EURO).map(([language, values]) => [
    language,
    Object.fromEntries(EURO_KEYS.map((key, index) => [key, values[index] ?? en[key] ?? key])),
  ]),
);

const MESSAGES: Record<Language, Record<string, string>> = {
  en,
  "zh-CN": zh,
  ko,
  ...EURO_MESSAGES,
} as Record<Language, Record<string, string>>;

export function translate(language: Language, key: string): string {
  return MESSAGES[language]?.[key] ?? en[key] ?? key;
}
