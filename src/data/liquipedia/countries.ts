/**
 * Liquipedia nationality names -> ISO 3166-1 alpha-2, for the flag badge.
 *
 * Covers every value that appears in `players.json`'s `nationalities`. The four
 * UK home nations collapse to GB; Kosovo uses the user-assigned XK. A name that
 * is not here renders without a flag rather than guessing.
 */
export const COUNTRY_CODES: Record<string, string> = {
  Albania: 'AL', Algeria: 'DZ', Andorra: 'AD', Argentina: 'AR', Australia: 'AU',
  Austria: 'AT', Azerbaijan: 'AZ', Bahrain: 'BH', Belarus: 'BY', Belgium: 'BE',
  Bolivia: 'BO', 'Bosnia and Herzegovina': 'BA', Brazil: 'BR', Bulgaria: 'BG',
  'Cabo Verde': 'CV', Cambodia: 'KH', Canada: 'CA', 'Cayman Islands': 'KY',
  Chile: 'CL', China: 'CN', Colombia: 'CO', 'Cook Islands': 'CK', 'Costa Rica': 'CR',
  Croatia: 'HR', Cuba: 'CU', Czechia: 'CZ', Denmark: 'DK', Dominica: 'DM',
  'Dominican Republic': 'DO', Ecuador: 'EC', Egypt: 'EG', 'El Salvador': 'SV',
  England: 'GB', Estonia: 'EE', Fiji: 'FJ', Finland: 'FI', France: 'FR',
  Georgia: 'GE', Germany: 'DE', Greece: 'GR', Greenland: 'GL', Guatemala: 'GT',
  Guinea: 'GN', Guyana: 'GY', Honduras: 'HN', 'Hong Kong': 'HK', Hungary: 'HU',
  Iceland: 'IS', India: 'IN', Indonesia: 'ID', Iran: 'IR', Iraq: 'IQ',
  Ireland: 'IE', Israel: 'IL', Italy: 'IT', Jamaica: 'JM', Japan: 'JP',
  Jordan: 'JO', Kazakhstan: 'KZ', Kenya: 'KE', Kosovo: 'XK', Kuwait: 'KW',
  Latvia: 'LV', Lebanon: 'LB', Lithuania: 'LT', Luxembourg: 'LU', Malaysia: 'MY',
  Malta: 'MT', Martinique: 'MQ', Mexico: 'MX', Moldova: 'MD', Morocco: 'MA',
  Namibia: 'NA', Netherlands: 'NL', 'New Zealand': 'NZ', Nicaragua: 'NI',
  Nigeria: 'NG', 'North Macedonia': 'MK', 'Northern Ireland': 'GB', Norway: 'NO',
  Oman: 'OM', Pakistan: 'PK', Palestine: 'PS', Panama: 'PA', Paraguay: 'PY',
  Peru: 'PE', Philippines: 'PH', Poland: 'PL', Portugal: 'PT', 'Puerto Rico': 'PR',
  Qatar: 'QA', Romania: 'RO', Russia: 'RU', 'Saudi Arabia': 'SA', Scotland: 'GB',
  Serbia: 'RS', Singapore: 'SG', Slovakia: 'SK', Slovenia: 'SI', 'South Africa': 'ZA',
  'South Korea': 'KR', Spain: 'ES', 'Sri Lanka': 'LK', Sweden: 'SE',
  Switzerland: 'CH', Syria: 'SY', Taiwan: 'TW', Thailand: 'TH',
  'Trinidad and Tobago': 'TT', Tunisia: 'TN', Turkey: 'TR', Uganda: 'UG',
  Ukraine: 'UA', 'United Arab Emirates': 'AE', 'United Kingdom': 'GB',
  'United States': 'US', Uruguay: 'UY', Venezuela: 'VE', Vietnam: 'VN',
  Wales: 'GB', Yemen: 'YE',
};
