const displayNames = new Map();
const activeLocale = () => typeof localStorage === "undefined" ? "en" : localStorage.getItem("adn-language") === "es" ? "es" : "en";
const COUNTRY_CODES = "AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW".split(" ");

function namesFor(locale = activeLocale()) {
  const language = String(locale).toLowerCase().startsWith("es") ? "es" : "en";
  if (!displayNames.has(language)) displayNames.set(language, typeof Intl.DisplayNames === "function" ? new Intl.DisplayNames([language], { type: "region" }) : null);
  return displayNames.get(language);
}

export const COUNTRIES = COUNTRY_CODES.map((code) => ({ code, get name() { return countryName(code); } }));

export function countryCode(country) {
  const original = String(country || "").trim();
  const code = original.toUpperCase();
  if (COUNTRY_CODES.includes(code)) return code;
  const normalized = original.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  return COUNTRY_CODES.find((candidate) => [namesFor("en")?.of(candidate), namesFor("es")?.of(candidate)]
    .some((name) => name?.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() === normalized)) || "";
}

export function countryName(country, locale) {
  const original = String(country || "").trim();
  const code = countryCode(original);
  return code ? namesFor(locale)?.of(code) || original : original;
}
