/**
 * Every cited figure the household sheets use: the exact figure as read on
 * the publisher's own page, PDF or dataset, with its period, scope and the
 * date we read it. A figure goes stale when its re-check cadence lapses or
 * its own end date passes; it is never quietly refreshed in code.
 */
import type { CitedSource } from './model';

const CHECKED = '2026-10-20';

type Group = Omit<CitedSource, 'figure' | 'label'>;
const from =
	(group: Group) =>
	(figure: number, label: string, extra: Partial<Group> = {}): CitedSource => ({
		...group,
		...extra,
		figure,
		label
	});

const redfin = from({
	url: 'https://redfin-public-data.s3.us-west-2.amazonaws.com/redfin_market_tracker/city_market_tracker.tsv000.gz',
	period: 'calendar year (median of monthly medians)',
	scope: 'single-family, by city',
	checkedAt: CHECKED,
	recheckDays: 3650
});
const pge = from({
	url: 'https://www.pge.com/assets/pge/docs/account/rate-plans/residential-electric-rate-plan-pricing.pdf.coredownload.pdf',
	period: 'effective 2026-03-01, winter',
	scope: 'PG&E bundled residential, EV2-A',
	checkedAt: CHECKED,
	recheckDays: 180
});
const mmwd = from({
	url: 'https://marinwater.org/wp-content/uploads/2026/06/English_Marin-Water-Rate-Tables_Effective-July-1-2026.pdf',
	period: 'effective 2026-07-01',
	scope: 'MMWD single-family, 5/8″ meter, per 2 months',
	checkedAt: CHECKED,
	recheckDays: 365,
	validUntil: '2027-06-30'
});
const usda = from({
	url: 'https://www.fns.usda.gov/sites/default/files/resource-files/CostofFoodSep2026LowModLib.pdf',
	period: 'September 2026, monthly',
	scope: 'USDA Liberal food plan, US average, 4-person household',
	checkedAt: CHECKED,
	recheckDays: 120
});
const payroll = from({
	url: 'https://www.irs.gov/pub/irs-pdf/p926.pdf',
	period: '2026',
	scope: 'US household employers (IRS Pub 926)',
	checkedAt: CHECKED,
	recheckDays: 365,
	validUntil: '2026-12-31'
});
const edd = from({
	url: 'https://edd.ca.gov/en/Payroll_Taxes/Rates_and_Withholding',
	period: '2026',
	scope: 'California employers (EDD)',
	checkedAt: CHECKED,
	recheckDays: 365,
	validUntil: '2026-12-31'
});
const careCom = (path: string, scope: string) =>
	from({
		url: `https://www.care.com/cost/${path}`,
		period: 'as of Oct 2026',
		scope: `${scope}, provider asking rates (Care.com)`,
		checkedAt: CHECKED,
		recheckDays: 90
	});
const dmv = from({
	url: 'https://www.dmv.ca.gov/portal/file/26vin07-pdf/',
	period: '2026 (rises 2027-01-01)',
	scope: 'California DMV fees',
	checkedAt: CHECKED,
	recheckDays: 365,
	validUntil: '2026-12-31'
});
const ikon = from({
	url: 'https://www.ikonpass.com/en/shop-passes',
	period: '2026-27 season',
	scope: 'US',
	checkedAt: CHECKED,
	recheckDays: 180
});
const kqed = from({
	url: 'https://www.kqed.org/support/membership',
	period: 'current',
	scope: 'KQED membership',
	checkedAt: CHECKED,
	recheckDays: 365
});
const mcds = from({
	url: 'https://www.mcds.org/admission/affording-mcds',
	period: '2026-27',
	scope: 'one Corte Madera K-8',
	checkedAt: CHECKED,
	recheckDays: 365
});
const marinFc = from({
	url: 'https://marinfc.org/wp-content/uploads/2026/04/MarinFC__2026-27_Webinar-Presentation.pptx.pdf',
	period: '2026-27',
	scope: 'Marin FC',
	checkedAt: CHECKED,
	recheckDays: 365
});
const tawonga = from({
	url: 'https://tawonga.org/wp-content/uploads/2026/05/2026-Programs.pdf',
	period: 'Summer 2026',
	scope: 'Camp Tawonga',
	checkedAt: CHECKED,
	recheckDays: 365
});
const bodyrok = from({
	url: 'https://bodyrok.com/studio/millvalley/',
	period: 'checked 2026-10-20',
	scope: 'BODYROK Mill Valley',
	checkedAt: CHECKED,
	recheckDays: 180
});
const therapy = from({
	url: 'https://www.psychologytoday.com/us/therapists/hilary-love-mill-valley-ca/1372825',
	period: 'checked 2026-10-20',
	scope: 'one Mill Valley LMFT’s posted fee (not a median)',
	checkedAt: CHECKED,
	recheckDays: 180
});
const insurify = from({
	url: 'https://www.insurify.com/car-insurance/california/average-cost',
	period: 'rates as of 2026-09-30',
	scope: 'California average (Insurify)',
	checkedAt: CHECKED,
	recheckDays: 180
});

export const CITED = {
	// Housing
	'redfin.larkspur.2024': redfin(2501250, '2024 Larkspur SFR median'),
	'redfin.millValley.2019': redfin(1790000, '2019 Mill Valley SFR median'),
	'redfin.larkspur.latest': redfin(3695000, 'Larkspur SFR median, May 2026 (11 sales)', {
		period: 'May 2026',
		recheckDays: 60
	}),
	'redfin.millValley.latest': redfin(3600000, 'Mill Valley SFR median, May 2026 (13 sales)', {
		period: 'May 2026',
		recheckDays: 60
	}),
	'redfin.ross.latest': redfin(5347500, 'Ross SFR median, May 2026 (4 sales)', {
		period: 'May 2026',
		recheckDays: 60
	}),
	'prop13.baseRate': from({
		url: 'https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?sectionNum=SEC.%201.&lawCode=CONS&article=XIII%20A',
		period: 'ongoing',
		scope: 'California (Cal. Const. art. XIII A)',
		checkedAt: CHECKED,
		recheckDays: 3650
	})(0.01, '1% base (Prop 13)'),

	// Utilities
	'pge.ev2a.offPeak': pge(0.23, 'EV2-A off-peak, $/kWh'),
	'pge.ev2a.peak': pge(0.41, 'EV2-A peak (4–9 pm), $/kWh'),
	'pge.gas.therm': from({
		url: 'https://www.pge.com/assets/pge/docs/account/rate-plans/gas-rate-advisory-0326.pdf',
		period: 'effective 2026-03-01',
		scope: 'PG&E bundled residential gas, non-CARE',
		checkedAt: CHECKED,
		recheckDays: 180
	})(2.792, '$/therm'),
	'mmwd.tier1': mmwd(10.86, 'tier 1, $/unit'),
	'mmwd.tier2': mmwd(14.19, 'tier 2, $/unit'),
	'mmwd.tier3': mmwd(22.92, 'tier 3, $/unit'),
	'mmwd.tier1Units': mmwd(15, 'tier 1 top, units per 2 months'),
	'mmwd.tier2Units': mmwd(25, 'tier 2 top, units per 2 months'),
	'mmwd.watershed': mmwd(0.66, 'watershed charge, $/unit'),
	'mmwd.fixed': mmwd(92.08, 'fixed charges ($55.61 + $36.47) per 2 months'),
	'mvrs.cart32': from({
		url: 'https://www.millvalleyrefuse.com/mobius/wp-content/uploads/2025/09/MVRS-Mill-Valley-Rate-Sheet-2025-2026.pdf',
		period: 'FY 2025-26',
		scope: 'Mill Valley, flat area',
		checkedAt: CHECKED,
		recheckDays: 365,
		validUntil: '2026-06-30'
	})(64.24, 'Mill Valley Refuse 32-gal, $/mo'),

	// Health
	'kff.familyContribution': from({
		url: 'https://www.kff.org/health-costs/2025-employer-health-benefits-survey/',
		period: '2025',
		scope: 'US, employer family coverage (KFF EHBS)',
		checkedAt: CHECKED,
		recheckDays: 365
	})(6850, 'avg worker contribution, family, $/yr'),

	// Food
	'usda.liberal.m19to50': usda(486.8, 'male 19-50'),
	'usda.liberal.f19to50': usda(429.6, 'female 19-50'),
	'usda.liberal.c6to8': usda(357.2, 'child 6-8'),
	'usda.liberal.c9to11': usda(408.2, 'child 9-11'),
	'usda.liberal.m12to13': usda(460.6, 'male 12-13'),
	'usda.liberal.f12to13': usda(401.1, 'female 12-13'),
	'usda.liberal.m14to18': usda(473.9, 'male 14-18'),
	'usda.liberal.m51to70': usda(449.1, 'male 51-70'),
	'usda.liberal.f51to70': usda(399.5, 'female 51-70'),

	// Kids
	'spark.ask': from({
		url: 'https://sparkschools.org/how-to-donate/',
		period: '2026-27',
		scope: 'Larkspur-Corte Madera SD foundation',
		checkedAt: CHECKED,
		recheckDays: 365
	})(1650, 'SPARK suggested gift per student'),
	'kiddo.ask': from({
		url: 'https://www.kiddo.org/annual-campaign',
		period: '2026-27',
		scope: 'Mill Valley SD foundation',
		checkedAt: CHECKED,
		recheckDays: 365
	})(1600, 'Kiddo! suggested gift per student'),
	'branson.total': from({
		url: 'https://www.branson.org/admissions/affording-branson',
		period: '2026-27',
		scope: 'one Ross private high school',
		checkedAt: CHECKED,
		recheckDays: 365
	})(71290, '9-12 day school total cost'),
	'mcds.tuition': mcds(51760, '6-8 day school top tuition'),
	'mcds.campWeek': from({
		url: 'https://www.mcds.org/2026-new-family-resources',
		period: 'Summer 2026',
		scope: 'MCDS Cougar Camp, half day',
		checkedAt: CHECKED,
		recheckDays: 365
	})(545, 'day camp, $/week'),
	'marinFc.registration': marinFc(1175, 'U8-U13 registration (est.)'),
	'marinFc.rvp': marinFc(350, 'RVP fee'),
	'marinRowing.junior': from({
		url: 'https://www.marinrowing.org/pricing',
		period: 'current season (page undated)',
		scope: 'Marin Rowing',
		checkedAt: CHECKED,
		recheckDays: 365
	})(5400, 'junior crew, $/yr'),
	'tawonga.twoWeeks': tawonga(5250, 'sleepaway, 2 weeks'),
	'tawonga.threeWeeks': tawonga(6695, 'sleepaway, 3 weeks'),
	'woom.explore5': from({
		url: 'https://woom.com/en_US/products/woom-explore-5-kids-bike',
		period: 'list price, 2026-10-20',
		scope: 'woom EXPLORE 5',
		checkedAt: CHECKED,
		recheckDays: 365
	})(819, 'kids’ bike'),

	// Help
	'careCom.nanny': careCom('nannies/novato-ca', 'the Mill Valley row of the Novato page')(
		33.62,
		'nanny avg starting rate, $/h'
	),
	'careCom.cleaner': careCom('house-cleaning/mill-valley-ca', 'Mill Valley')(
		27.5,
		'house cleaner start, $/h'
	),
	'careCom.cleanerMax': careCom('house-cleaning/mill-valley-ca', 'Mill Valley')(
		32.13,
		'house cleaner max, $/h'
	),
	'payroll.ssRate': payroll(0.062, 'employer Social Security'),
	'payroll.ssWageBase': payroll(184500, 'Social Security wage base'),
	'payroll.medicareRate': payroll(0.0145, 'employer Medicare'),
	'payroll.futaNet': payroll(0.006, 'FUTA net of the full credit'),
	'payroll.futaWageBase': payroll(7000, 'FUTA wage base'),
	'edd.uiNewEmployer': edd(0.034, 'CA UI, new employer'),
	'edd.ett': edd(0.001, 'CA ETT'),
	'edd.uiWageBase': edd(7000, 'CA UI/ETT wage base'),

	// Wellness
	'bodyrok.eight': bodyrok(189, 'reformer Pilates, 8/mo'),
	'bodyrok.twelve': bodyrok(239, 'reformer Pilates, 12/mo'),
	'therapy.individual': therapy(210, 'individual session'),
	'therapy.couples': therapy(260, 'couples session'),
	'parsley.year': from({
		url: 'https://www.parsleyhealth.com/insurance',
		period: 'checked 2026-10-20',
		scope: 'Parsley Health, national (its pages conflict)',
		checkedAt: CHECKED,
		recheckDays: 180
	})(2750, 'functional-medicine membership, $/yr'),

	// Cars
	'rivian.dueAtSigning': from({
		url: 'https://rivian.com/offers',
		period: 'orders to 2026-11-02',
		scope: 'Rivian R1S Dual Large lease, US',
		checkedAt: CHECKED,
		recheckDays: 30,
		validUntil: '2026-11-02'
	})(7604, 'due at signing'),
	'rangeRover.lease': from({
		url: 'https://www.rangerover.com/en-us/current-offers/range-rover-sport-offers.html',
		period: 'deliveries by 2026-11-02',
		scope: 'Range Rover Sport P360 SE, US offer, 24 mo',
		checkedAt: CHECKED,
		recheckDays: 30,
		validUntil: '2026-11-02'
	})(999, 'lease, $/mo'),
	'rangeRover.dueAtSigning': from({
		url: 'https://www.rangerover.com/en-us/current-offers/range-rover-sport-offers.html',
		period: 'deliveries by 2026-11-02',
		scope: 'Range Rover Sport P360 SE, US offer',
		checkedAt: CHECKED,
		recheckDays: 30,
		validUntil: '2026-11-02'
	})(8995, 'due at signing'),
	'kbb.ex90.lease': from({
		url: 'https://www.kbb.com/volvo/ex90/deals-incentives/',
		period: 'expires 2026-11-02',
		scope: 'Volvo EX90, ZIP 95401 offer, 36 mo',
		checkedAt: CHECKED,
		recheckDays: 30,
		validUntil: '2026-11-02'
	})(889, 'lease, $/mo'),
	'kbb.ex90.dueAtSigning': from({
		url: 'https://www.kbb.com/volvo/ex90/deals-incentives/',
		period: 'expires 2026-11-02',
		scope: 'Volvo EX90, ZIP 95401 offer',
		checkedAt: CHECKED,
		recheckDays: 30,
		validUntil: '2026-11-02'
	})(889, 'due at signing'),
	'insurify.ca': insurify(2440, 'CA average auto insurance, $/yr'),
	'dmv.registration': dmv(73, 'registration fee'),
	'dmv.chp': dmv(34, 'CHP fee'),
	'dmv.tif.over60k': dmv(231, 'transportation improvement fee, $60k+'),
	'dmv.tif.35kTo60k': dmv(198, 'transportation improvement fee, $35k–60k'),
	'dmv.tif.5kTo25k': dmv(66, 'transportation improvement fee, $5k–25k'),
	'dmv.evRoadFee': dmv(121, 'road improvement fee (zero-emission)'),

	// Travel, belonging, giving, business
	'ikon.child': ikon(499, 'child 5-12'),
	'ikon.youngAdult': ikon(1129, 'young adult 13-22'),
	'truckee.median': from({
		url: 'https://resideline.com/blog/truckee-ca-housing-market',
		period: '6 months to Sep 2026',
		scope: 'Truckee median sale',
		checkedAt: CHECKED,
		recheckDays: 180
	})(986000, 'Truckee median sale'),
	'kqed.memberPlus': kqed(96, 'Member Plus, $/yr'),
	'kqed.signalSociety': kqed(1000, 'Signal Society, $/yr'),
	'nrf.holidayGifts': from({
		url: 'https://nrf.com/media-center/press-releases/consumers-to-spend-second-highest-amount-on-record-according-to-nrf-holiday-survey',
		period: 'Holiday 2025',
		scope: 'US, per person (NRF)',
		checkedAt: CHECKED,
		recheckDays: 365
	})(627.93, 'holiday gifts per person'),
	'coworking.millValley': from({
		url: 'https://www.coworkingcafe.com/coworking-space/memberships/us/ca/mill-valley/',
		period: 'directory, undated',
		scope: 'Mill Valley 94941 average (range $250–339)',
		checkedAt: CHECKED,
		recheckDays: 180
	})(294.5, 'coworking desk, $/mo')
} as const satisfies Record<string, CitedSource>;
for (const source of Object.values(CITED)) Object.freeze(source);
Object.freeze(CITED);

export type CitedId = keyof typeof CITED;
