import nextConfig from "eslint-config-next";
import firebaseRulesPlugin from '@firebase/eslint-plugin-security-rules';

const config = [
  ...nextConfig,
  {
    rules: {
      'react-hooks/set-state-in-effect': 'off',
    },
  },
  {
    files: ["**/*.rules"],
    plugins: { 
      "@firebase/security-rules": firebaseRulesPlugin 
    },
    languageOptions: {
      parser: firebaseRulesPlugin.parser
    },
    rules: {
      "@firebase/security-rules/no-open-reads": "warn",
      "@firebase/security-rules/no-open-writes": "error",
      "@firebase/security-rules/no-redundant-matches": "error"
    }
  }
];

export default config;
