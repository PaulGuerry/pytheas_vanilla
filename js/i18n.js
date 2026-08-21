export let currentLang = 'en';

export const translations = {
    en: {
      assistantTitle: "Pytheas Assistant",
      welcomeMsg: 'Ask a query to explore metrics and static subgroups (e.g., <em>"survival ATP8B1 PFIC boys"</em>, <em>"CADD score PFIC1"</em>, <em>"ALT newborn period"</em>, or <i>"longitudinal weight"</i>).',
      inputPlaceholder: "Ask Pytheas a question...",
      footerContact: "Contact:",
      footerCite: "Please cite:",
      footerSponsors: "Sponsors:",
      resultTitle: "Pytheas Result — ",
      fallbackError: "Sorry, the request could not be matched with any currently accessible data.",
      fallbackEmailLink: "click here to send an email request to contact.pytheasdb@gmail.com",
      showingResultsFor: "Showing results for",
      correctedFrom: "corrected from",
      table: {
        disease: "DISEASE",
        geneSubgroup: "GENE SUBGROUP",
        patients: "Patients",
        dataCoverage: "Data coverage",
        medianOnset: "Age at first symptoms",
        medianCadd: "CADD score",
        sexRatio: "Sex ratio",
        surv1yr: "1-YR SURVIVAL",
        surv5yr: "5-YR SURVIVAL",
        surv10yr: "10-YR SURVIVAL",
        color: "COLOR",
        allGenes: "All Genes"
      },
      variables: {
        survival: "Overall Survival",
        sex_ratio: "Sex Ratio Analysis",
        variant_types: "Variant Type Distribution",
        zygosity: "Zygosity Proportions",
        cadd_scores: "CADD Score Distribution & Categories",
        age_first_symptoms: "Age of First Symptoms (Median / Range)",
        age_onset_inverse_survival: "Cumulative Age of First Symptoms Onset",
        symptom_age_onset: "Symptom-Specific Age-of-Onset",
        symptom_prevalence: "Symptom Prevalence",
        absent_symptom_prevalence: "Absent Symptom Prevalence",
        birth_weight: "Birth Weight Distribution",
        birth_height: "Birth Height Distribution",
        longitudinal: "Longitudinal LOESS Trend",
        treatments: "Treatment Efficacy"
      },
      chart: {
        ageMonths: "Age (Months)",
        overallSurvivalRate: "Overall Survival Rate",
        counts: "Counts",
        cumSymptomOnset: "Cumulative Symptom Onset (1 - KM)",
        labMetric: "Lab Metric",
        aggregated: "Aggregated"
      },
      categories: {
        variant: ["missense", "frameshift", "nonsense", "splice_site", "deletion", "insertion"],
        zygosity: ["homozygous", "compound heterozygous", "heterozygous"],
        cadd: ["high (>=20)", "moderate (10-19.9)", "low (<10)"],
        treatments: ["Response / Benefit", "Transient / Limited", "No Response / Worse", "Unknown"]
      }
    },
    fr: {
      assistantTitle: "Assistant Pytheas",
      welcomeMsg: 'Posez une question pour explorer les métriques et les sous-groupes (ex: <em>"survie ATP8B1 PFIC garçons"</em>, <em>"score CADD PFIC1"</em>, <em>"ALT période néonatale"</em>, ou <i>"poids longitudinal"</i>).',
      inputPlaceholder: "Posez une question à Pytheas...",
      footerContact: "Contact :",
      footerCite: "Veuillez citer :",
      footerSponsors: "Sponsors :",
      resultTitle: "Résultat Pytheas — ",
      fallbackError: "Désolé, la demande n'a pu être associée à aucune donnée actuellement accessible.",
      fallbackEmailLink: "cliquez ici pour envoyer une demande par courriel à contact.pytheasdb@gmail.com",
      showingResultsFor: "Affichage des résultats pour",
      correctedFrom: "corrigé depuis",
      table: {
        disease: "MALADIE",
        geneSubgroup: "SOUS-GROUPE GÉNIQUE",
        patients: "PATIENTS",
        dataCoverage: "COUVERTURE DES DONNÉES",
        medianOnset: "DÉBUT MÉDIAN [MIN - MAX]",
        medianCadd: "CADD MÉDIAN [MIN - MAX]",
        sexRatio: "RATIO DES SEXES",
        surv1yr: "SURVIE À 1 AN",
        surv5yr: "SURVIE À 5 ANS",
        surv10yr: "SURVIE À 10 ANS",
        color: "COULEUR",
        allGenes: "Tous les gènes"
      },
      variables: {
        survival: "Survie globale",
        sex_ratio: "Analyse du ratio des sexes",
        variant_types: "Distribution des types de variants",
        zygosity: "Proportions de zygosité",
        cadd_scores: "Distribution et catégories de scores CADD",
        age_first_symptoms: "Âge des premiers symptômes (Médiane / Étendue)",
        age_onset_inverse_survival: "Âge cumulé de début des premiers symptômes",
        symptom_age_onset: "Âge de début des symptômes spécifiques",
        symptom_prevalence: "Prévalence des symptômes",
        absent_symptom_prevalence: "Prévalence des symptômes absents",
        birth_weight: "Distribution du poids de naissance",
        birth_height: "Distribution de la taille de naissance",
        longitudinal: "Tendance longitudinale LOESS",
        treatments: "Efficacité du traitement"
      },
      chart: {
        ageMonths: "Âge (Mois)",
        overallSurvivalRate: "Taux de survie globale",
        counts: "Effectifs",
        cumSymptomOnset: "Début cumulé des symptômes (1 - KM)",
        labMetric: "Métrique de laboratoire",
        aggregated: "Agrégé"
      },
      categories: {
        variant: ["faux-sens", "décalage du cadre", "non-sens", "site d'épissage", "délétion", "insertion"],
        zygosity: ["homozygote", "hétérozygote composite", "hétérozygote"],
        cadd: ["élevé (>=20)", "modéré (10-19.9)", "faible (<10)"],
        treatments: ["Réponse / Bénéfice", "Transitoire / Limité", "Pas de réponse / Pire", "Inconnu"]
      }
    }
  };

export function setLanguage(lang) {
  currentLang = lang;
  document.querySelectorAll('.lang-btn').forEach(btn => btn.classList.remove('active'));
  
  const activeBtn = document.getElementById(`btn-${lang}`);
  if (activeBtn) activeBtn.classList.add('active');

  // Update text content
  document.querySelectorAll('[data-i18n]').forEach(elem => {
    const key = elem.getAttribute('data-i18n');
    if (translations[lang] && translations[lang][key]) {
      elem.innerHTML = translations[lang][key];
    }
  });

  // Update input placeholders
  document.querySelectorAll('[data-i18n-placeholder]').forEach(elem => {
    const key = elem.getAttribute('data-i18n-placeholder');
    if (translations[lang] && translations[lang][key]) {
      elem.placeholder = translations[lang][key];
    }
  });
}

