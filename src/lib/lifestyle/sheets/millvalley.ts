/** Mill Valley wellness: fictional household · modelled spending. Approved 2026-10-20. */
import type { HouseholdSheet, LineSpec } from '../model';
import { asGift, cite, live, monthly, persona, waterInputs, yearly } from '../sheet-kit';
import { car, electricity, NOT_MODELLED, propertyTax } from './shared';

const price = () => cite('redfin.millValley.2019', undefined, 1790000);

const lines: LineSpec[] = [
	{
		id: 'millvalley.home.pi',
		section: 'housing',
		label: 'Mortgage (P&I, 2021 refi)',
		required: true,
		inputs: {
			price: price(),
			loanToValue: persona(0.8, '20% down'),
			ratePct: persona(3.82, 'rate 3.82% (= PMMS 2019-06-06)'),
			termYears: persona(30, '30-year fixed'),
			refiRatePct: persona(2.75, 'refi Feb 2021 at 2.75%'),
			refiTermYears: persona(30, '30-year refi')
		},
		terms: [{ kind: 'mortgage' }],
		note: 'PMMS 2021-01-07 was 2.65%: the refi rate is plausible.'
	},
	propertyTax('millvalley', {
		bases: [{ value: price(), years: 7 }],
		growth: 0.02,
		bondRate: 0.00121,
		parcels: { Tam: 560, 'MVSD Measure E': 1754, wildfire: 240 },
		note: 'Measure E passage not certified in our check.'
	}),
	{
		id: 'millvalley.home.ins',
		section: 'housing',
		label: 'Homeowners insurance',
		required: true,
		inputs: { premium: persona(7800, '$7,800/yr') },
		terms: [yearly('premium')]
	},
	{
		id: 'millvalley.home.upkeep',
		section: 'housing',
		label: 'Upkeep',
		required: true,
		inputs: { price: price(), share: persona(0.01, '1% of price per year') },
		terms: [yearly('price', 'share')]
	},
	electricity('millvalley', { kwh: 750, offPeakShare: 0.8, baseCharge: 24 }),
	{
		id: 'millvalley.util.gas',
		section: 'utilities',
		label: 'Natural gas',
		required: true,
		inputs: { therms: persona(45, 'therms/mo'), rate: cite('pge.gas.therm') },
		terms: [monthly('therms', 'rate')]
	},
	{
		id: 'millvalley.util.water',
		section: 'utilities',
		label: 'Water (MMWD)',
		required: true,
		inputs: { units: persona(24, 'units per 2 months'), ...waterInputs() },
		terms: [{ kind: 'water', unitsBimonthly: 'units' }]
	},
	{
		id: 'millvalley.util.garbage',
		section: 'utilities',
		label: 'Garbage, 32-gal cart',
		required: true,
		inputs: { cart: cite('mvrs.cart32') },
		terms: [monthly('cart')]
	},
	{
		id: 'millvalley.util.net',
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
		id: 'millvalley.health.prem',
		section: 'health',
		label: 'Health premium (employee share, family)',
		required: true,
		inputs: { premium: cite('kff.familyContribution') },
		terms: [yearly('premium')]
	},
	{
		id: 'millvalley.health.oop',
		section: 'health',
		label: 'Out-of-pocket',
		required: true,
		inputs: { oop: persona(5000, '$5,000/yr') },
		terms: [yearly('oop')]
	},
	...car('millvalley', 'ex90', 'Volvo EX90', {
		lease: { pay: cite('kbb.ex90.lease'), due: cite('kbb.ex90.dueAtSigning'), months: 36 },
		power: { kind: 'ev', milesPerKwh: 2.5 },
		value: 80000,
		vlfRate: 0.0065,
		tif: 'dmv.tif.over60k',
		miles: 800,
		maintenancePerMile: 0.06
	}),
	...car('millvalley', 'modelY', 'Tesla Model Y', {
		lease: {
			pay: persona(599, 'Model Y Premium lease (search only; tesla.com returned 403)'),
			due: persona(4195, 'due at signing (search only)'),
			months: 36
		},
		power: { kind: 'ev', milesPerKwh: 2.5 },
		value: 47380,
		vlfRate: 0.0065,
		tif: 'dmv.tif.35kTo60k',
		miles: 700,
		maintenancePerMile: 0.06
	}),
	{
		id: 'millvalley.food.groceries',
		section: 'food',
		label: 'Groceries (USDA Liberal plan)',
		required: true,
		inputs: {
			man: cite('usda.liberal.m19to50'),
			woman: cite('usda.liberal.f19to50'),
			twelve: cite('usda.liberal.m12to13'),
			nine: cite('usda.liberal.c9to11')
		},
		terms: [monthly('man'), monthly('woman'), monthly('twelve'), monthly('nine')]
	},
	{
		id: 'millvalley.food.clean',
		section: 'food',
		signature: true,
		label: 'The clean extras',
		required: true,
		inputs: {
			collagenTubs: persona(2, 'collagen tubs a month'),
			collagen: live('grocery.collagen'),
			honeyJars: persona(2, 'manuka jars a month'),
			honey: live('grocery.manuka'),
			kombuchas: persona(16, 'kombuchas a month'),
			kombucha: live('grocery.kombucha'),
			oatMilks: persona(8, 'oat milks a month'),
			oatMilk: live('grocery.oatMilk')
		},
		terms: [
			monthly('collagenTubs', 'collagen'),
			monthly('honeyJars', 'honey'),
			monthly('kombuchas', 'kombucha'),
			monthly('oatMilks', 'oatMilk')
		]
	},
	{
		id: 'millvalley.food.coffee',
		section: 'food',
		label: 'Coffee out',
		required: true,
		inputs: {
			adults: persona(2, 'adults'),
			days: persona(26, 'days'),
			price: live('coffee.cappuccino')
		},
		terms: [monthly('adults', 'days', 'price')]
	},
	{
		id: 'millvalley.food.dining',
		section: 'food',
		label: 'Dinners out',
		required: true,
		inputs: { dinners: persona(5, 'dinners a month'), dinner: persona(150, 'for two') },
		terms: [monthly('dinners', 'dinner')]
	},
	{
		id: 'millvalley.kids.foundation',
		section: 'kids',
		label: 'Kiddo! foundation ask ×2',
		required: true,
		inputs: { kids: persona(2, 'kids'), ask: cite('kiddo.ask') },
		terms: [asGift(yearly('kids', 'ask'))]
	},
	{
		id: 'millvalley.kids.soccer',
		section: 'kids',
		label: 'Club soccer ×2 (travel team)',
		required: true,
		inputs: {
			kids: persona(2, 'kids'),
			registration: cite('marinFc.registration'),
			rvp: cite('marinFc.rvp'),
			months: persona(5, 'team-fee months'),
			teamFee: persona(800, 'travel team fee')
		},
		terms: [
			yearly('kids', 'registration'),
			yearly('kids', 'rvp'),
			yearly('kids', 'months', 'teamFee')
		]
	},
	{
		id: 'millvalley.kids.tutor',
		section: 'kids',
		label: 'Tutoring + math enrichment',
		required: true,
		inputs: {
			hours: persona(4, 'tutor hours a month'),
			tutor: persona(120, 'tutor $/h'),
			math: persona(499, 'math center $/mo (search only)')
		},
		terms: [monthly('hours', 'tutor'), monthly('math')]
	},
	{
		id: 'millvalley.kids.camp',
		section: 'kids',
		label: 'Camp: 6 wks × 2 + 2-wk sleepaway',
		required: true,
		inputs: {
			weeks: persona(6, 'day-camp weeks'),
			kids: persona(2, 'kids'),
			week: cite('mcds.campWeek'),
			sleepaway: cite('tawonga.twoWeeks')
		},
		terms: [yearly('weeks', 'kids', 'week'), yearly('sleepaway')]
	},
	{
		id: 'millvalley.kids.parties',
		section: 'kids',
		label: 'Birthday circuit',
		required: true,
		inputs: { parties: persona(20, 'parties a year'), gift: persona(40, 'gift') },
		terms: [yearly('parties', 'gift')]
	},
	{
		id: 'millvalley.help.cleaner',
		section: 'help',
		label: 'Cleaner, weekly',
		required: true,
		inputs: {
			visits: persona(52, 'visits a year'),
			hours: persona(5, 'hours a visit'),
			rate: cite('careCom.cleaner')
		},
		terms: [yearly('visits', 'hours', 'rate')]
	},
	{
		id: 'millvalley.well.pilates',
		section: 'wellness',
		label: 'Pilates, 12/mo each',
		required: true,
		inputs: { adults: persona(2, 'adults'), plan: cite('bodyrok.twelve') },
		terms: [monthly('adults', 'plan')]
	},
	{
		id: 'millvalley.well.therapy',
		section: 'wellness',
		signature: true,
		label: 'Therapy: individual weekly + couples twice monthly',
		required: true,
		inputs: {
			weeks: persona(52, 'individual sessions a year'),
			individual: cite('therapy.individual'),
			couplesSessions: persona(2, 'couples sessions a month'),
			couples: cite('therapy.couples')
		},
		terms: [yearly('weeks', 'individual'), monthly('couplesSessions', 'couples')]
	},
	{
		id: 'millvalley.well.fm',
		section: 'wellness',
		signature: true,
		label: 'Functional-medicine membership ×2',
		required: true,
		inputs: { members: persona(2, 'members'), membership: cite('parsley.year') },
		terms: [yearly('members', 'membership')]
	},
	{
		id: 'millvalley.well.retreat',
		section: 'wellness',
		label: 'A retreat a year, for two',
		required: true,
		inputs: {
			people: persona(2, 'people'),
			retreat: persona(1608, '5 days, per person (search only)')
		},
		terms: [yearly('people', 'retreat')]
	},
	{
		id: 'millvalley.travel.ikon',
		section: 'travel',
		label: 'Ikon passes (2 adults, 2 kids)',
		required: true,
		inputs: {
			adults: persona(2, 'adults'),
			adult: live('ikon.adult'),
			kids: persona(2, 'kids'),
			child: cite('ikon.child')
		},
		terms: [yearly('adults', 'adult'), yearly('kids', 'child')]
	},
	{
		id: 'millvalley.travel.skiweek',
		section: 'travel',
		label: 'Ski-week lodging',
		required: true,
		inputs: { nights: persona(6, 'nights'), night: persona(700, 'a night') },
		terms: [yearly('nights', 'night')]
	},
	{
		id: 'millvalley.travel.wellness',
		section: 'travel',
		signature: true,
		label: '“Wellness travel”',
		required: true,
		inputs: { travel: persona(14000, '$14,000') },
		terms: [yearly('travel')]
	},
	{
		id: 'millvalley.belong.kqed',
		section: 'belonging',
		label: 'Public media (Signal Society)',
		required: true,
		inputs: { membership: cite('kqed.signalSociety') },
		terms: [asGift(yearly('membership'))]
	},
	{
		id: 'millvalley.belong.gala',
		section: 'belonging',
		signature: true,
		label: 'A gala table',
		required: true,
		inputs: { table: persona(10000, 'table of 10 (search only)') },
		terms: [yearly('table')]
	},
	{
		id: 'millvalley.give',
		section: 'giving',
		label: 'Gifts & giving',
		required: true,
		inputs: {
			people: persona(4, 'people'),
			gifts: cite('nrf.holidayGifts'),
			other: persona(2000, 'other giving')
		},
		terms: [yearly('people', 'gifts'), asGift(yearly('other'))]
	},
	{
		id: 'millvalley.biz',
		section: 'business',
		signature: true,
		label: 'The Business: the consultancy’s coworking desk',
		required: true,
		inputs: { desk: cite('coworking.millValley') },
		terms: [monthly('desk')]
	}
];

export const millvalley: HouseholdSheet = {
	id: 'millvalley',
	version: '2026-10-20',
	name: 'Mill Valley wellness',
	town: 'Mill Valley',
	who: '2 adults (45, 44): tech, and a “consultancy”; kids 12 and 9',
	status: 'mfj',
	split: [0.85, 0.15],
	deferrals: [24500, 24500],
	children: 2,
	afterTaxSavings: 2 * 600 * 12,
	savingsNote: '401(k) max ×2 (pre-tax); 529 $600/mo × 2 (after-tax, persona)',
	purchase: { firstPayment: '2019-07', refiFirstPayment: '2021-03' },
	marketTracker: cite('redfin.millValley.latest'),
	coverage: {
		housing: { answer: 'priced', where: 'P&I (2021 refi), tax, insurance, upkeep' },
		utilities: { answer: 'priced', where: 'electric, gas, water, garbage, internet + phones' },
		health: { answer: 'priced', where: 'premium, out-of-pocket' },
		cars: { answer: 'priced', where: '2 EV leases' },
		food: {
			answer: 'priced',
			where: 'groceries, “the clean extras” from our live basket, coffee, dining'
		},
		'kids.school': { answer: 'priced', where: 'public MVSD; the Kiddo! ask' },
		'kids.activities': { answer: 'priced', where: 'travel soccer ×2, tutoring, math' },
		'kids.camp': { answer: 'priced', where: 'day camp + sleepaway' },
		'kids.childcare': {
			answer: 'persona',
			where: 'none: kids 12 and 9; one parent “consults” from home'
		},
		help: { answer: 'priced', where: 'weekly cleaner as a service; no house manager' },
		wellness: { answer: 'priced', where: 'Pilates ×2, therapy, functional medicine, retreat' },
		travel: { answer: 'priced', where: 'Ikon, ski week, “wellness travel”' },
		belonging: { answer: 'priced', where: 'KQED Signal Society, a gala table' },
		giving: { answer: 'priced', where: 'gifts + other giving' },
		business: {
			answer: 'priced',
			where: 'the consultancy’s coworking desk (its revenue is the 15% earner)'
		},
		savings: { answer: 'priced', where: 'outside the burn: 401(k) pre-tax, 529 after-tax' }
	},
	lines,
	notModelled: NOT_MODELLED
};
