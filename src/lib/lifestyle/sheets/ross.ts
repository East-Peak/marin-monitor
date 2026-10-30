/** Ross old money: fictional household · modelled spending. Approved 2026-10-20. */
import type { HouseholdSheet, LineSpec } from '../model';
import {
	asGift,
	asPropertyTax,
	cite,
	employerTaxInputs,
	live,
	monthly,
	persona,
	waterInputs,
	yearly
} from '../sheet-kit';
import { car, electricity, NOT_MODELLED, propertyTax } from './shared';

const lines: LineSpec[] = [
	{
		id: 'ross.home.pi',
		section: 'housing',
		signature: true,
		label: 'Mortgage',
		required: true,
		inputs: {},
		terms: [{ kind: 'mortgage' }],
		note: 'Bought 1998, paid off.'
	},
	propertyTax('ross', {
		label: 'Property tax (Prop 13 base + 2022 remodel)',
		bases: [
			{ value: persona(1110000, '1998 price (2019 Ross median × FHFA 1998/2019)'), years: 28 },
			{ value: persona(1500000, 'remodel reassessed 2022'), years: 4 }
		],
		growth: 0.02,
		bondRate: 0.00126,
		parcels: { Tam: 560, 'Ross SD (est.)': 1694, wildfire: 400 }
	}),
	{
		id: 'ross.home.ins',
		section: 'housing',
		label: 'Homeowners insurance',
		required: true,
		inputs: { premium: persona(16800, '$16,800/yr') },
		terms: [yearly('premium')]
	},
	{
		id: 'ross.home.upkeep',
		section: 'housing',
		label: 'Upkeep (big old house, big garden)',
		required: true,
		inputs: { upkeep: persona(48000, '$48,000/yr') },
		terms: [yearly('upkeep')]
	},
	electricity('ross', { kwh: 1400, offPeakShare: 0.8, baseCharge: 24 }),
	{
		id: 'ross.util.gas',
		section: 'utilities',
		label: 'Natural gas',
		required: true,
		inputs: { therms: persona(90, 'therms/mo'), rate: cite('pge.gas.therm') },
		terms: [monthly('therms', 'rate')]
	},
	{
		id: 'ross.util.water',
		section: 'utilities',
		label: 'Water (MMWD)',
		required: true,
		inputs: { units: persona(60, 'units per 2 months'), ...waterInputs() },
		terms: [{ kind: 'water', unitsBimonthly: 'units' }]
	},
	{
		id: 'ross.util.garbage',
		section: 'utilities',
		label: 'Garbage, 64-gal cart',
		required: true,
		inputs: { cart: persona(96.92, 'Marin Sanitary 64-gal $96.92 (draft ordinance)') },
		terms: [monthly('cart')]
	},
	{
		id: 'ross.util.net',
		section: 'utilities',
		label: 'Internet + 2 phones',
		required: true,
		inputs: {
			internet: persona(90, 'gigabit internet'),
			phones: persona(2, 'phones'),
			phone: persona(75, 'per phone')
		},
		terms: [monthly('internet'), monthly('phones', 'phone')],
		note: 'Address-specific pricing; no cited figure.'
	},
	{
		id: 'ross.health.prem',
		section: 'health',
		label: 'Health premium (employee share, family)',
		required: true,
		inputs: { premium: cite('kff.familyContribution') },
		terms: [yearly('premium')]
	},
	{
		id: 'ross.health.oop',
		section: 'health',
		label: 'Out-of-pocket',
		required: true,
		inputs: { oop: persona(7000, '$7,000/yr') },
		terms: [yearly('oop')]
	},
	...car('ross', 'rangeRover', 'Range Rover Sport', {
		lease: { pay: cite('rangeRover.lease'), due: cite('rangeRover.dueAtSigning'), months: 24 },
		power: { kind: 'gas', mpg: 20 },
		value: 95000,
		vlfRate: 0.0065,
		tif: 'dmv.tif.over60k',
		miles: 700,
		maintenancePerMile: 0.11
	}),
	{
		id: 'ross.car.vintage',
		section: 'cars',
		signature: true,
		label: 'The vintage something: storage, insurance, fettling',
		required: true,
		inputs: { upkeep: persona(900, '$900/mo') },
		terms: [monthly('upkeep')]
	},
	{
		id: 'ross.food.groceries',
		section: 'food',
		label: 'Groceries (USDA Liberal plan)',
		required: true,
		inputs: {
			man: cite('usda.liberal.m51to70'),
			woman: cite('usda.liberal.f51to70'),
			sixteen: cite('usda.liberal.m14to18'),
			thirteen: cite('usda.liberal.f12to13')
		},
		terms: [monthly('man'), monthly('woman'), monthly('sixteen'), monthly('thirteen')]
	},
	{
		id: 'ross.food.club',
		section: 'food',
		label: 'Club dining minimum',
		required: true,
		inputs: { minimum: persona(400, '$400/mo (minimums unpublished)') },
		terms: [monthly('minimum')]
	},
	{
		id: 'ross.food.dining',
		section: 'food',
		label: 'Dinners out',
		required: true,
		inputs: { dinners: persona(4, 'dinners a month'), dinner: persona(200, 'for two') },
		terms: [monthly('dinners', 'dinner')]
	},
	{
		id: 'ross.food.wine',
		section: 'food',
		label: 'Wine',
		required: true,
		inputs: { bottles: persona(8, 'bottles a month'), price: live('grocery.silverOak') },
		terms: [monthly('bottles', 'price')]
	},
	{
		id: 'ross.kids.tuition',
		section: 'kids',
		signature: true,
		label: 'Private day school ×2',
		required: true,
		inputs: { upper: cite('branson.total'), middle: cite('mcds.tuition') },
		terms: [yearly('upper'), yearly('middle')]
	},
	{
		id: 'ross.kids.crew',
		section: 'kids',
		label: 'Crew (16-yr-old)',
		required: true,
		inputs: { season: cite('marinRowing.junior') },
		terms: [yearly('season')]
	},
	{
		id: 'ross.kids.squash',
		section: 'kids',
		label: 'Squash (13-yr-old)',
		required: true,
		inputs: { fee: persona(400, '$400/mo') },
		terms: [monthly('fee')]
	},
	{
		id: 'ross.kids.counsellor',
		section: 'kids',
		label: 'College counsellor (amortised 2 yrs)',
		required: true,
		inputs: { pkg: persona(9000, '$9,000 package'), years: persona(2, 'years') },
		terms: [{ kind: 'product', per: 'year', factors: ['pkg'], divide: ['years'] }]
	},
	{
		id: 'ross.kids.camp',
		section: 'kids',
		label: 'Sleepaway ×2',
		required: true,
		inputs: { three: cite('tawonga.threeWeeks'), two: cite('tawonga.twoWeeks') },
		terms: [yearly('three'), yearly('two')]
	},
	{
		id: 'ross.help.gardener',
		section: 'help',
		label: 'Gardener, 3 days/wk (employer cost)',
		required: true,
		inputs: {
			rate: persona(35, '$35/h'),
			hours: persona(24, 'h/wk'),
			...employerTaxInputs()
		},
		terms: [{ kind: 'employer', rate: 'rate', hoursPerWeek: 'hours' }],
		note: 'No Marin gardener rate found.'
	},
	{
		id: 'ross.help.housekeeper',
		section: 'help',
		label: 'Housekeeper, full time (employer cost)',
		required: true,
		inputs: {
			rate: cite('careCom.cleanerMax'),
			hours: persona(40, 'h/wk'),
			...employerTaxInputs()
		},
		terms: [{ kind: 'employer', rate: 'rate', hoursPerWeek: 'hours' }]
	},
	{
		id: 'ross.help.manager',
		section: 'help',
		signature: true,
		label: 'House manager, 3 days/wk (employer cost)',
		required: true,
		inputs: {
			salary: persona(185000, '$185,000/yr full-time rate (one SF posting)'),
			fullTime: persona(2080, 'full-time hours a year'),
			hours: persona(24, 'h/wk'),
			...employerTaxInputs()
		},
		terms: [{ kind: 'employer', rate: 'salary', rateHours: 'fullTime', hoursPerWeek: 'hours' }],
		note: 'Part-time.'
	},
	{
		id: 'ross.well.tennis',
		section: 'wellness',
		label: 'Tennis pro, weekly',
		required: true,
		inputs: { weeks: persona(52, 'lessons a year'), lesson: persona(120, '$120/h') },
		terms: [yearly('weeks', 'lesson')]
	},
	{
		id: 'ross.well.physio',
		section: 'wellness',
		label: 'Physio, twice monthly',
		required: true,
		inputs: { sessions: persona(2, 'sessions a month'), session: persona(175, '$175') },
		terms: [monthly('sessions', 'session')]
	},
	{
		id: 'ross.travel.ikon',
		section: 'travel',
		label: 'Ikon passes (2 adults, 16 and 13)',
		required: true,
		inputs: {
			adults: persona(2, 'adults'),
			adult: live('ikon.adult'),
			kids: persona(2, 'teens'),
			young: cite('ikon.youngAdult')
		},
		terms: [yearly('adults', 'adult'), yearly('kids', 'young')]
	},
	{
		id: 'ross.travel.cabin',
		section: 'travel',
		label: 'The Tahoe cabin’s carrying cost',
		required: true,
		inputs: {
			median: cite('truckee.median'),
			assessed: persona(0.6, 'assessed at 60% (bought 2005)'),
			taxRate: persona(0.011, 'tax 1.1%'),
			insurance: persona(6000, 'insurance $/yr'),
			utilities: persona(4800, 'utilities $/yr'),
			upkeep: persona(9000, 'upkeep $/yr')
		},
		terms: [
			asPropertyTax(yearly('median', 'assessed', 'taxRate')),
			yearly('insurance'),
			yearly('utilities'),
			yearly('upkeep')
		]
	},
	{
		id: 'ross.travel.xmas',
		section: 'travel',
		signature: true,
		label: 'Christmas abroad',
		required: true,
		inputs: { trip: persona(30000, '$30,000') },
		terms: [yearly('trip')]
	},
	{
		id: 'ross.belong.club',
		section: 'belonging',
		label: 'Club dues',
		required: true,
		inputs: { dues: persona(1800, '$1,800/mo (dues unpublished)') },
		terms: [monthly('dues')]
	},
	{
		id: 'ross.belong.galas',
		section: 'belonging',
		signature: true,
		label: 'Galas',
		required: true,
		inputs: { table: persona(25000, 'sponsor table (search only)') },
		terms: [yearly('table')]
	},
	{
		id: 'ross.belong.kqed',
		section: 'belonging',
		label: 'Public media (Signal Society)',
		required: true,
		inputs: { membership: cite('kqed.signalSociety') },
		terms: [asGift(yearly('membership'))]
	},
	{
		id: 'ross.give',
		section: 'giving',
		label: 'The land trust, the school, the hospital',
		required: true,
		inputs: { gifts: persona(36000, '$36,000/yr') },
		terms: [asGift(yearly('gifts'))]
	},
	{
		id: 'ross.give.gifts',
		section: 'giving',
		label: 'Holiday gifts',
		required: true,
		inputs: { people: persona(4, 'people'), gifts: cite('nrf.holidayGifts') },
		terms: [yearly('people', 'gifts')]
	},
	{
		id: 'ross.biz',
		section: 'business',
		label: 'The Business',
		required: false,
		inputs: { none: persona(0, 'no business') },
		terms: [monthly('none')]
	}
];

export const ross: HouseholdSheet = {
	id: 'ross',
	version: '2026-10-20',
	name: 'Ross old money',
	town: 'Ross',
	who: '2 adults (61, 58), kids 16 and 13',
	status: 'mfj',
	split: [0.7, 0.3],
	deferrals: [0, 0],
	children: 2,
	afterTaxSavings: 0,
	savingsNote: 'none: “already done”',
	purchase: { firstPayment: '1998-07', paidOff: true },
	marketTracker: cite('redfin.ross.latest'),
	coverage: {
		housing: { answer: 'priced', where: 'P&I is $0: paid off' },
		utilities: { answer: 'priced', where: 'electric, gas, water, garbage, internet + phones' },
		health: { answer: 'priced', where: 'premium, out-of-pocket' },
		cars: { answer: 'priced', where: 'Range Rover Sport lease + the vintage car' },
		food: {
			answer: 'priced',
			where: 'coffee is at home (persona: not priced); club minimum, dining, wine'
		},
		'kids.school': { answer: 'priced', where: 'two private day-school tuitions' },
		'kids.activities': { answer: 'priced', where: 'crew, squash, college counsellor' },
		'kids.camp': { answer: 'priced', where: 'sleepaway ×2' },
		'kids.childcare': { answer: 'persona', where: 'none: kids 16 and 13' },
		help: {
			answer: 'priced',
			where: 'gardener, housekeeper, part-time house manager, all W-2 all-in'
		},
		wellness: { answer: 'priced', where: 'tennis pro, physio' },
		travel: { answer: 'priced', where: 'Ikon, the Tahoe cabin, Christmas abroad' },
		belonging: { answer: 'priced', where: 'club dues, galas, KQED' },
		giving: { answer: 'priced', where: 'land trust / school / hospital, holiday gifts' },
		business: { answer: 'persona', where: 'none: no business' },
		savings: { answer: 'persona', where: 'none: “already done”' }
	},
	lines,
	notModelled: NOT_MODELLED
};
