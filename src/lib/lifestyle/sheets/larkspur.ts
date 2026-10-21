/** Larkspur strivers: fictional household · modelled spending. Approved 2026-10-20. */
import type { HouseholdSheet, LineSpec } from '../model';
import {
	asGift,
	cite,
	employerTaxInputs,
	less,
	live,
	monthly,
	persona,
	spread,
	waterInputs,
	yearly
} from '../sheet-kit';
import { car, electricity, NOT_MODELLED, propertyTax } from './shared';

const price = () => cite('redfin.larkspur.2024', undefined, 2501250);

const lines: LineSpec[] = [
	{
		id: 'larkspur.home.pi',
		section: 'housing',
		label: 'Mortgage (P&I)',
		required: true,
		inputs: {
			price: price(),
			loanToValue: persona(0.8, '20% down'),
			ratePct: persona(6.99, 'rate 6.99% (= PMMS 2024-06-06)'),
			termYears: persona(30, '30-year fixed')
		},
		terms: [{ kind: 'mortgage' }],
		note: 'Frozen at purchase (Jun 2024). Doesn’t move with today’s median.'
	},
	propertyTax('larkspur', {
		bases: [{ value: price(), years: 2 }],
		growth: 0.02,
		bondRate: 0.00121,
		parcels: { Tam: 560, 'LCMSD (est.)': 1106, wildfire: 240 },
		note: 'Tax rate book is Cloudflare-blocked; bond overlay and LCMSD parcel tax are estimates.'
	}),
	{
		id: 'larkspur.home.ins',
		section: 'housing',
		label: 'Homeowners insurance (FAIR Plan + wrap)',
		required: true,
		inputs: { premium: persona(8400, '$8,400/yr') },
		terms: [yearly('premium')],
		note: 'No per-home figure is published (Marin median premium $2,658, 2024, for scale).'
	},
	{
		id: 'larkspur.home.upkeep',
		section: 'housing',
		label: 'Upkeep',
		required: true,
		inputs: { price: price(), share: persona(0.01, '1% of price per year') },
		terms: [yearly('price', 'share')]
	},
	electricity('larkspur', { kwh: 700, offPeakShare: 0.8, baseCharge: 24 }),
	{
		id: 'larkspur.util.gas',
		section: 'utilities',
		label: 'Natural gas',
		required: true,
		inputs: { therms: persona(40, 'therms/mo'), rate: cite('pge.gas.therm') },
		terms: [monthly('therms', 'rate')]
	},
	{
		id: 'larkspur.util.water',
		section: 'utilities',
		label: 'Water (MMWD)',
		required: true,
		inputs: { units: persona(22, 'units per 2 months'), ...waterInputs() },
		terms: [{ kind: 'water', unitsBimonthly: 'units' }]
	},
	{
		id: 'larkspur.util.garbage',
		section: 'utilities',
		label: 'Garbage, 32-gal cart',
		required: true,
		inputs: { cart: persona(48.46, 'Marin Sanitary $48.46 (draft ordinance, not confirmed)') },
		terms: [monthly('cart')]
	},
	{
		id: 'larkspur.util.net',
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
		id: 'larkspur.health.prem',
		section: 'health',
		label: 'Health premium (employee share, family)',
		required: true,
		inputs: { premium: cite('kff.familyContribution') },
		terms: [yearly('premium')],
		note: 'US average, employer plan.'
	},
	{
		id: 'larkspur.health.oop',
		section: 'health',
		label: 'Out-of-pocket',
		required: true,
		inputs: { oop: persona(4000, '$4,000/yr') },
		terms: [yearly('oop')]
	},
	...car('larkspur', 'rivian', 'Rivian R1S', {
		lease: { pay: live('rivian.lease'), due: cite('rivian.dueAtSigning'), months: 36 },
		power: { kind: 'ev', milesPerKwh: 2.5 },
		value: 85885,
		vlfRate: 0.0065,
		tif: 'dmv.tif.over60k',
		miles: 900,
		maintenancePerMile: 0.06
	}),
	...car('larkspur', 'suv', 'Gas SUV', {
		power: { kind: 'gas', mpg: 20 },
		value: 22000,
		vlfRate: 0.0065,
		tif: 'dmv.tif.5kTo25k',
		miles: 700,
		maintenancePerMile: 0.11
	}),
	{
		id: 'larkspur.food.groceries',
		section: 'food',
		label: 'Groceries (USDA Liberal plan)',
		required: true,
		inputs: {
			man: cite('usda.liberal.m19to50'),
			woman: cite('usda.liberal.f19to50'),
			nine: cite('usda.liberal.c9to11'),
			six: cite('usda.liberal.c6to8')
		},
		terms: [monthly('man'), monthly('woman'), monthly('nine'), monthly('six')],
		note: 'US average, family of four; no Marin adjustment exists.'
	},
	{
		id: 'larkspur.food.coffee',
		section: 'food',
		label: 'Coffee out',
		required: true,
		inputs: {
			adults: persona(2, 'adults'),
			days: persona(22, 'workdays'),
			price: live('coffee.cappuccino')
		},
		terms: [monthly('adults', 'days', 'price')]
	},
	{
		id: 'larkspur.food.dining',
		section: 'food',
		label: 'Dinners out (incl. SF runs)',
		required: true,
		inputs: {
			dinners: persona(4, 'dinners a month'),
			dinner: persona(150, 'for two'),
			sitterHours: persona(4, 'sitter hours a dinner'),
			sitter: persona(25, 'sitter $/h')
		},
		terms: [monthly('dinners', 'dinner'), monthly('dinners', 'sitterHours', 'sitter')]
	},
	{
		id: 'larkspur.food.wine',
		section: 'food',
		label: 'Wine',
		required: true,
		inputs: { bottles: persona(2, 'bottles a month'), price: live('grocery.silverOak') },
		terms: [monthly('bottles', 'price')]
	},
	{
		id: 'larkspur.kids.foundation',
		section: 'kids',
		label: 'SPARK foundation ask ×2',
		required: true,
		inputs: { kids: persona(2, 'kids'), ask: cite('spark.ask') },
		terms: [asGift(yearly('kids', 'ask'))]
	},
	{
		id: 'larkspur.kids.soccer',
		section: 'kids',
		label: 'Club soccer (9-yr-old)',
		required: true,
		inputs: {
			registration: cite('marinFc.registration'),
			rvp: cite('marinFc.rvp'),
			months: persona(5, 'team-fee months'),
			teamFee: persona(650, 'team fee (mid of $400–900)')
		},
		terms: [yearly('registration'), yearly('rvp'), yearly('months', 'teamFee')]
	},
	{
		id: 'larkspur.kids.math',
		section: 'kids',
		label: 'Math enrichment (9-yr-old)',
		required: true,
		inputs: { fee: persona(499, '$499/mo, 12-mo contract (search only)') },
		terms: [monthly('fee')]
	},
	{
		id: 'larkspur.kids.robotics',
		section: 'kids',
		label: 'Robotics / art / swim (6-yr-old)',
		required: true,
		inputs: { fee: persona(450, '$450/mo') },
		terms: [monthly('fee')]
	},
	{
		id: 'larkspur.kids.bike',
		section: 'kids',
		label: 'Bikes (woom, amortised 3 yr)',
		required: true,
		inputs: {
			bikes: persona(2, 'bikes'),
			price: cite('woom.explore5'),
			life: persona(36, 'months of life')
		},
		terms: [spread(['bikes', 'price'], ['life'])]
	},
	{
		id: 'larkspur.kids.camp',
		section: 'kids',
		label: 'Summer camp: 8 wks × 2 kids',
		required: true,
		inputs: {
			weeks: persona(8, 'weeks'),
			kids: persona(2, 'kids'),
			week: cite('mcds.campWeek')
		},
		terms: [yearly('weeks', 'kids', 'week')]
	},
	{
		id: 'larkspur.kids.parties',
		section: 'kids',
		label: 'Birthday circuit',
		required: true,
		inputs: { parties: persona(25, 'parties a year'), gift: persona(40, 'gift') },
		terms: [yearly('parties', 'gift')]
	},
	{
		id: 'larkspur.help.nanny',
		section: 'help',
		label: 'Nanny, 25 h/wk (employer cost)',
		required: true,
		inputs: {
			rate: cite('careCom.nanny'),
			hours: persona(25, 'h/wk'),
			...employerTaxInputs()
		},
		terms: [{ kind: 'employer', rate: 'rate', hoursPerWeek: 'hours' }]
	},
	{
		id: 'larkspur.help.cleaner',
		section: 'help',
		label: 'Cleaner, biweekly',
		required: true,
		inputs: {
			visits: persona(26, 'visits a year'),
			hours: persona(4, 'hours a visit'),
			rate: cite('careCom.cleaner')
		},
		terms: [yearly('visits', 'hours', 'rate')],
		note: 'Treated as a service, not an employee.'
	},
	{
		id: 'larkspur.well.pilates',
		section: 'wellness',
		label: 'Pilates, 8/mo',
		required: true,
		inputs: { plan: cite('bodyrok.eight') },
		terms: [monthly('plan')]
	},
	{
		id: 'larkspur.travel.ikon',
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
		id: 'larkspur.travel.skiweek',
		section: 'travel',
		label: 'Ski-week lodging + lessons',
		required: true,
		inputs: {
			nights: persona(6, 'nights'),
			night: persona(700, 'Presidents’ week, a night'),
			kids: persona(2, 'kids'),
			days: persona(4, 'lesson days'),
			lesson: persona(200, 'a lesson day')
		},
		terms: [yearly('nights', 'night'), yearly('kids', 'days', 'lesson')],
		note: 'AirDNA publishes annual ADR only ($573 Tahoe City); the peak-week rate is persona.'
	},
	{
		id: 'larkspur.travel.summer',
		section: 'travel',
		label: 'Summer trip',
		required: true,
		inputs: { trip: persona(12000, '$12,000') },
		terms: [yearly('trip')]
	},
	{
		id: 'larkspur.belong.kqed',
		section: 'belonging',
		label: 'Public media',
		required: true,
		inputs: { membership: cite('kqed.memberPlus') },
		terms: [asGift(yearly('membership'))]
	},
	{
		id: 'larkspur.give',
		section: 'giving',
		label: 'Gifts & giving',
		required: true,
		inputs: {
			people: persona(4, 'people'),
			gifts: cite('nrf.holidayGifts'),
			other: persona(1000, 'other giving')
		},
		terms: [yearly('people', 'gifts'), asGift(yearly('other'))]
	},
	{
		id: 'larkspur.biz',
		section: 'business',
		label: 'The Business: a downtown tinned-fish shop',
		required: true,
		inputs: {
			sqft: persona(800, 'sq ft'),
			rent: persona(60, '$/sq ft/yr (Magnolia Ave asking, search only)'),
			wage: persona(22, 'staff $/h'),
			hours: persona(60, 'staff hours a week (1.5 FTE)'),
			...employerTaxInputs(),
			sales: persona(8000, 'sales a month'),
			cogs: persona(0.55, 'cost of goods'),
			overhead: persona(1200, 'utilities, POS, insurance a month')
		},
		terms: [
			yearly('sqft', 'rent'),
			{ kind: 'employer', rate: 'wage', hoursPerWeek: 'hours' },
			monthly('sales', 'cogs'),
			monthly('overhead'),
			less('sales')
		],
		note: 'Monthly loss, paid from after-tax income.'
	}
];

export const larkspur: HouseholdSheet = {
	id: 'larkspur',
	version: '2026-10-20',
	name: 'Larkspur strivers',
	town: 'Larkspur',
	who: '2 adults (42, 41): SF finance, and the shop; kids 9 and 6',
	status: 'mfj',
	split: [0.85, 0.15],
	deferrals: [24500, 24500],
	children: 2,
	afterTaxSavings: 2 * 500 * 12,
	savingsNote: '401(k) max ×2 (pre-tax); 529 $500/mo × 2 kids (after-tax, persona)',
	purchase: { firstPayment: '2024-07' },
	marketTracker: cite('redfin.larkspur.latest'),
	coverage: {
		housing: { answer: 'priced', where: 'P&I, tax, insurance, upkeep' },
		utilities: { answer: 'priced', where: 'electric, gas, water, garbage, internet + phones' },
		health: { answer: 'priced', where: 'premium, out-of-pocket' },
		cars: {
			answer: 'priced',
			where: 'Rivian leased; the gas SUV is owned outright, so no payment'
		},
		food: { answer: 'priced', where: 'groceries, coffee, dining, wine' },
		'kids.school': { answer: 'priced', where: 'public LCMSD; the SPARK ask is the school line' },
		'kids.activities': {
			answer: 'priced',
			where: 'soccer, math, robotics/art/swim, bikes, birthdays'
		},
		'kids.camp': { answer: 'priced', where: 'summer camp' },
		'kids.childcare': { answer: 'priced', where: 'the nanny, under Help' },
		help: { answer: 'priced', where: 'nanny (W-2, all-in); cleaner as a service' },
		wellness: { answer: 'priced', where: 'Pilates' },
		travel: { answer: 'priced', where: 'Ikon, ski week, summer trip' },
		belonging: { answer: 'priced', where: 'public media only: no club' },
		giving: { answer: 'priced', where: 'gifts + other giving' },
		business: { answer: 'priced', where: 'the tinned-fish shop’s monthly loss' },
		savings: { answer: 'priced', where: 'outside the burn: 401(k) pre-tax, 529 after-tax' }
	},
	lines,
	notModelled: NOT_MODELLED
};
