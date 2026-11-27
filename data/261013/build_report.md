# Build report, release 261013

Export `261013_pytheasDB.json`: 1784 records; 1771 patients in the release, 13 left out. HPO: hpo_dag.json.gz + id_to_term.json.gz. Built 2026-11-27T14:31:06.

Phenomeprint layout: 602 nodes (239 terminal) in 19 organ systems, from 28 diseases of at least 10 patients, levels 1-8; parents not drawn: 0. Widths (fixed shares, then setmax): Nervous system 15°, Head and neck 15°, Eye 13°, Ear 12°, Growth 15°, Musculoskeletal 15°, Limbs 8°, Integument 15°, Prenatal and birth 9°, Digestive 90°, Metabolism 15°, Respiratory 15°, Cardiovascular 14°, Blood 15°, Immune 15°, Endocrine 8°, Genitourinary 15°, Constitutional 8°, Cellular 8°.

## Records left out (13)

- `ATP1`: disease = `EXCLUDE` (marked for exclusion)
- `ATP2`: disease = `EXCLUDE` (marked for exclusion)
- `ATP8`: disease = `EXCLUDE` (marked for exclusion)
- `PFIC3_Nayagam2022_08`: disease = `Exclude(PFIC3)` (marked for exclusion)
- `PFIC2_Nayagam2022_31`: disease = `Exclude(PFIC2)` (marked for exclusion)
- `PFIC2_Nayagam2022_116`: disease = `Exclude(PFIC2)` (marked for exclusion)
- `PFIC1_Nayagam2022_45`: disease = `Exclude(PFIC1)` (marked for exclusion)
- `PFIC123_159`: disease = `EXCLUDE` (marked for exclusion)
- `PFIC123_160`: disease = `EXCLUDE` (marked for exclusion)
- `PFIC123_161`: disease = `EXCLUDE` (marked for exclusion)
- `PFIC123_162`: disease = `EXCLUDE` (marked for exclusion)
- `PFIC3.BA_Zhang2019`: disease = `Exclude(PFIC3+BA)` (marked for exclusion)
- `PFIC123_360`: disease = `Exclude(PFIC2)` (marked for exclusion)

## Gene values removed

| value | n |
| --- | --- |
| `Not tested` | 146 |
| `Unclear` | 1 |
| `ABCB11/ATP8B1` | 1 |
| `Not found` | 1 |
| `Not identified` | 1 |
| `MVID` | 1 |

## Sex values not read

| value | n |
| --- | --- |
| `B` | 1 |

## Consanguinity values not read

| value | n |
| --- | --- |
| `f` | 2 |

## HPO edge changes (2)

- removed HP:0000989 -> HP:0001396
- added HP:0006580 -> HP:0001395

Duplicated terms within a patient: 214. Terms added from `symptoms_age`: 30. Onsets given as upper bounds (`<`): 9.

## symptoms_age items not read

| value | n |
| --- | --- |
| `0000952(1.5)` | 1 |
| `0001744(1àm)` | 1 |
| `0001394(cirrhose)` | 1 |
| `0001744(0000952)` | 1 |

Resolved terms (listed in `transientsymptoms`, present and later absent): 999.

## Terms present and absent but not listed as transient (counted present) (30)

- Pfister2022_PFIC123_149 HP:0002028
- PFIC3_Oliveira2017 HP:0000952
- LSR_004_Cosar2025_1 HP:0002904
- LSR_011_Laborde2026_2 HP:0002904
- UNC45A_029_Wang2023 HP:0002904
- UNC45A_029_Wang2023 HP:0002908
- UNC45A_029_Wang2023 HP:0031964
- UNC45A_029_Wang2023 HP:0030948
- MYO5B_Ruemmele2004_02_iu HP:0033994
- MYO5B_Ruemmele2004_03_m8 HP:0033994
- MYO5B_Ruemmele2004_03_m8 HP:0001406
- MYO5B_Ruemmele2004_03_m8 HP:0001046
- MYO5B_Ruemmele2004_06_mb HP:0033994
- MYO5B_Ruemmele2004_08_1w HP:0001944
- MYO5B_Ruemmele2004_12_71 HP:0001944
- MYO5B_Ruemmele2010_AldrianTS1r58 HP:0001406
- MYO5B_Ruemmele2010_AldrianTS1r58 HP:0001046
- MYO5B_Ruemmele2010_AldrianTS1r58 HP:0033994
- MYO5B_Ruemmele2010_AldrianTS1r59 HP:0033994
- MYO5B_Ruemmele2010_AldrianTS1r59 HP:0001406
- MYO5B_Ruemmele2010_AldrianTS1r59 HP:0001046
- MYO5B_Ruemmele2010_AldrianTS1r60 HP:0001406
- MYO5B_Ruemmele2010_AldrianTS1r60 HP:0001046
- MYO5B_Ruemmele2010_AldrianTS1r62 HP:0001406
- MYO5B_Ruemmele2010_AldrianTS1r62 HP:0001046
- MYO5B_Ruemmele2010_AldrianTS1r63 HP:0033994
- MYO5B_Ruemmele2010_AldrianTS1r65 HP:0001406
- MYO5B_Ruemmele2010_AldrianTS1r65 HP:0001046
- MYO5B_Ruemmele2010_AldrianTS1r66 HP:0033994
- MYO5B_Ruemmele2010_AldrianTS1r66 HP:0000083

## HPO codes found in treatment lists (left out) (11)

- Knisely2006_C_PFIC123_111 0030948
- MetRS_Hadchouel2015_04 0002206
- LysRS_Zhou2017_02 0031910
- LysRS_Zhou2017_02 0031826
- LysRS_Zhou2017_02 0012373
- LysRS_Zhou2017_02 0012372
- LysRS_Zhou2017_02 0000252
- LysRS_Zhou2017_02 0040129
- LysRS_Zhou2017_02 0001290
- LysRS_Zhou2017_02 0001638
- LysRS_Zhou2017_02 0001250

## Free-text treatment fields (112)

- `KIF8`: "A05AA02" read as UDCA
- `ZFY1`: "A05AA02_4.9" read as UDCA
- `ZFY2`: "A05AA02_5" read as UDCA
- `ZFY3`: "A05AA02_1.17" read as UDCA
- `ZFY4`: "A05AA02_1.17" read as UDCA
- `ZFY5`: "A05AA02_1.33" read as UDCA
- `ZFY6`: "A05AA02_4.9" read as UDCA
- `ZFY7`: "A05AA02_4" read as UDCA
- `ZFY9`: "A05AA02_0.25" read as UDCA
- `ZFY10`: "A05AA02_J04AB02" read as UDCA, rifampicin
- `PFIC1_2021Yang.03_ATP6`: "middle (no pruritus)" read as nothing
- `THE001`: "H02AB09(6mg/kg/j)_B05BA01(d24)" read as hydrocortisone, parenteral nutrition
- `THE002`: "J01EE01 J06BA01(4y)" read as co-trimoxazole, immunoglobulins
- `THE004`: "J06BA01(neonat puis stop)" read as immunoglobulins
- `THE005`: "J06BA01(neonat puis stop)" read as immunoglobulins
- `THE006`: "J06BA01(neonat jusqu'a 14a)" read as immunoglobulins
- `THE007`: "J06BA01(neonat puis stop)" read as immunoglobulins
- `THE008`: "J06BA01(neonat puis stop)" read as immunoglobulins
- `THE009`: "J06BA01(neonat puis stop)" read as immunoglobulins
- `THE010`: "J06BA01(neonat puis stop)" read as immunoglobulins
- `THE011`: "J06BA01(neonat puis stop)" read as immunoglobulins
- `THE012`: "J06BA01(neonat puis stop)" read as immunoglobulins
- `THE013`: "J06BA01(neonat puis stop)" read as immunoglobulins
- `THE014`: "J06BA01(neonat puis stop)" read as immunoglobulins
- `THE016`: "H01AC01(9,7y)" read as growth hormone
- `THE020`: "J06BA01(3y)" read as immunoglobulins
- `THE022`: "J06BA01" read as immunoglobulins
- `THE023`: "J06BA01_J01EE01" read as immunoglobulins, co-trimoxazole
- `THE055`: "J06BA01(D336–1,858)" read as immunoglobulins
- `THE057`: "J06BA01(1,009–on going)" read as immunoglobulins
- `THE058`: "J06BA01(D202–on going)" read as immunoglobulins
- `THE059`: "J06BA01(D97–on going)" read as immunoglobulins
- `THE085`: "J06BA01" read as immunoglobulins
- `THE086`: "J06BA01" read as immunoglobulins
- `THE089`: "J06BA02" read as IVIg
- `THE090`: "J06BA02" read as IVIg
- `THE091`: "J06BA02" read as IVIg
- `THE093`: "Prophylactic trimethoprim-sulfamethoxazole (5 mg/kg/daily" read as co-trimoxazole
- `THE100`: "prednisolone (1 mg/kg/day) and azathioprine IgIV" read as prednisolone, azathioprine, IVIg
- `SKIC21`: "B05BA01" read as parenteral nutrition
- `SKIC22`: "B05BA01" read as parenteral nutrition
- `SKIC23`: "C02DA01 _H01AC01 (5y)" read as diazoxide, growth hormone
- `SKIC25`: "J06BA01(D33–4,023)" read as immunoglobulins
- `SKIC26`: "J06BA01(D99–328)" read as immunoglobulins
- `SKIC27`: "hormone replacement therapy/" read as nothing
- `SKIC249`: "IgIV" read as IVIg
- `SKIC250`: "growth hormone(5y)" read as growth hormone
- `SKIC251`: "Steroides" read as steroids
- `SKIC254`: "UDCA" read as UDCA
- `SKIC256`: "IGIV" read as IVIg
- `SKIC257`: "bactrim" read as co-trimoxazole
- `PFIC123_353`: "UDCA, rifampicin and colestyramine" read as UDCA, rifampicin, colestyramine
- `PFIC2_W-Zinman2017_2`: "colestyramine and hydroxyzine" read as colestyramine
- `PFIC123_371`: "UDCA 4-phenylbutyrate therapy" read as UDCA, NaPB
- `PFIC123_372`: "UDCA 4-phenylbutyrate therapy" read as UDCA, NaPB
- `PFIC123_373`: "UDCA 4-phenylbutyrate therapy" read as UDCA, NaPB
- `PFIC3_Fang2012_P13`: "UDCA" read as UDCA
- `PFIC1_2003Lyka_PFIC123_385`: "UDCA" read as UDCA
- `PFIC4_010`: "C10AC01_A05AA02_Bicyclol" read as colestyramine, UDCA, bicyclol
- `PFIC4_012`: "A05AA02_C07AA05" read as UDCA, propranolol
- `PFIC4_013`: "A05AA02_C10AC01_FatSolubleVit" read as UDCA, colestyramine, fat-soluble vitamins
- `PFIC4_014`: "A05AA02_C10AC01_FatSolubleVit" read as UDCA, colestyramine, fat-soluble vitamins
- `PFIC4_015`: "A05AA02_C10AC01_FatSolubleVit" read as UDCA, colestyramine, fat-soluble vitamins
- `PFIC4_016`: "A05AA02_C10AC01_FatSolubleVit" read as UDCA, colestyramine, fat-soluble vitamins
- `PFIC4_017`: "A05AA02_C10AC01_FatSolubleVit" read as UDCA, colestyramine, fat-soluble vitamins
- `PFIC4_018`: "A05AA02_C10AC01_FatSolubleVit" read as UDCA, colestyramine, fat-soluble vitamins
- `PFIC4_019`: "A05AA02_C10AC01_FatSolubleVit" read as UDCA, colestyramine, fat-soluble vitamins
- `PFIC4_021`: "A05AA02_Glycyrhizine" read as UDCA, glycyrrhizin
- `PFIC5_001`: "A05AA02 C03DA01_A06AD11." read as UDCA, spironolactone, lactulose
- `PFIC5_003`: "B05AX03" read as blood plasma
- `PFIC5_005`: "A05AA02" read as UDCA
- `PFIC6_001`: "A05AA02" read as UDCA
- `PFIC6_002`: "A05AA02" read as UDCA
- `PFIC7_003`: "J04AB02_A05AA02" read as rifampicin, UDCA
- `PFIC7_004`: "A05AA02" read as UDCA
- `PFIC7_005`: "J04AB02" read as rifampicin
- `PFIC7_007`: "J04AB02_A05AA02_C10AC01" read as rifampicin, UDCA, colestyramine
- `PFIC7_012`: "A05AA02" read as UDCA
- `PFIC7_013`: "J04AB02_A05AA02_C10AC01" read as rifampicin, UDCA, colestyramine
- `PFIC7_014`: "C10AC01_A05AA02" read as colestyramine, UDCA
- `PFIC7_015`: "prednisolone." read as prednisolone
- `PFIC7_017`: "J04AB02" read as rifampicin
- `PFIC7_018`: "J04AB02" read as rifampicin
- `PFIC7_019`: "C10AC01_A05AA02" read as colestyramine, UDCA
- `PFIC7_020`: "C10AC01_A05AA02" read as colestyramine, UDCA
- `PFIC7_021`: "A05AA02" read as UDCA
- `PFIC7_022`: "C10AC01_A05AA02" read as colestyramine, UDCA
- `PFIC7_023`: "A05AA02" read as UDCA
- `PFIC7_024`: "C10AC01_A05AA02_cochlear implant" read as colestyramine, UDCA
- `PFIC7_025`: "C10AC01_A05AA02" read as colestyramine, UDCA
- `PFIC7_026`: "J04AB02_A05AA02" read as rifampicin, UDCA
- `PFIC7_027`: "A05AA02" read as UDCA
- `MYO5B_Girard2014_P1`: "J04AB02_C10AC01_A05AA02" read as rifampicin, colestyramine, UDCA
- `MYO5B_Girard2014_P2`: "J04AB02_C10AC01_A05AA02" read as rifampicin, colestyramine, UDCA
- `MYO5B_Girard2014_P3`: "J04AB02_C10AC01_A05AA02" read as rifampicin, colestyramine, UDCA
- `MYO5B_Girard2014_P4`: "J04AB02_C10AC01_A05AA02" read as rifampicin, colestyramine, UDCA
- `MYO5B_Girard2014_P5`: "J04AB02_C10AC01_A05AA02" read as rifampicin, colestyramine, UDCA
- `MYO5B_Girard2014_P6`: "J04AB02_C10AC01_A05AA02" read as rifampicin, colestyramine, UDCA
- `MYO5B_Girard2014_P7`: "J04AB02_C10AC01_A05AA02" read as rifampicin, colestyramine, UDCA
- `MYO5B_Girard2014_P8`: "J04AB02_C10AC01_A05AA02" read as rifampicin, colestyramine, UDCA
- `PFIC10_2022Hassan01`: "A05AA02_J04AB02" read as UDCA, rifampicin
- `PFIC10_2022Hassan02`: "A05AA02_J04AB02" read as UDCA, rifampicin
- `MYO5B_Matarazzo2022_P1`: "A05AA02_J04AB02_C10AC01" read as UDCA, rifampicin, colestyramine
- `MYO5B_Matarazzo2022_P2`: "A05AA02_J04AB02" read as UDCA, rifampicin
- `MYO5B_Matarazzo2022_P3`: "A05AA02_J04AB02" read as UDCA, rifampicin
- `MYO5B_Matarazzo2022_P4`: "A05AA02_J04AB02" read as UDCA, rifampicin
- `MYO5B_Matarazzo2022_P5`: "A05AA02_J04AB02_C10AC01" read as UDCA, rifampicin, colestyramine
- `MYO5B_Matarazzo2022_P6`: "A05AA02_J04AB02" read as UDCA, rifampicin
- `MYO5B_Vij2021`: "A05AA02_C10AC01" read as UDCA, colestyramine
- `MYO5B_Aksu2021`: "A05AA02" read as UDCA
- `PFIC11_001`: "01AC01_A05AA02" read as UDCA
- `CDG2P_001`: "J01RA01" read as penicillin combination

## Laboratory series left out (variable [unit])

| value | n |
| --- | --- |
| `HCC []` | 16 |

## Laboratory series not read (7)

- PFIC3_Liu2022 ALP: times and values differ in length
- Jank2021_PFIC123_232 CB: times and values differ in length
- PFIC2_Goto2003_02 TB: times and values differ in length
- PFIC2_Takahashi2007 ALT: times and values differ in length
- PFIC1_Morris2015_2 TB: times and values differ in length
- PFIC1_Morris2015_2 ALT: times and values differ in length
- PFIC3_Fang2012_P13 PLT: times and values differ in length

Laboratory points without time or value, dropped: 109.

## Birth values out of range (left out) (2)

- ValRS_Siekierska2019_05 birth head circumference 48.0
- Bogershausen2022_05_SerRS birth head circumference 52.0

## Fields not carried (records holding them)

| value | n |
| --- | --- |
| `ttt` | 3 |
| `undefined` | 2 |
| `biology` | 2 |
| `diseases` | 1 |
