import moment from 'moment';

type BuildParams = {
  submission: {
    fullName: string;
    nssNumber: string;
    divisionPostedTo: string;
    user: { phoneNumber: string; department: { name: string } };
  };
  currentYear: number;
  nextYear: number;
  yearRange: string;
  today: string;
  departmentName: string;
  referenceNumber: string;
  letterheadBase64: string | null;
  signatureBase64: string;
};

export function buildJobConfirmationLetterDocDefinition(params: BuildParams) {
  const {
    submission,
    currentYear,
    nextYear,
    yearRange,
    today,
    departmentName,
    referenceNumber,
    letterheadBase64,
    signatureBase64,
  } = params;

  return {
    background: [
      letterheadBase64
        ? {
            image: 'letterhead',
            width: 595,
            absolutePosition: { x: 0, y: 0 },
          }
        : undefined,
    ].filter(Boolean),
    content: [
      { text: '', bold: true, fontSize: 14, alignment: 'center', margin: [0, 0, 0, 20] },
      { text: '', alignment: 'right', fontSize: 11, margin: [0, 0, 0, 5] },
      { text: '', alignment: 'right', fontSize: 11, margin: [0, 0, 0, 20] },
      { text: '', fontSize: 11, margin: [0, 0, 0, 20] },
      {
        columns: [
          {
            text: referenceNumber,
            alignment: 'left',
            fontSize: 11,
            bold: true,
            margin: [120, 0, 0, 10],
          },
          { text: today, alignment: 'right', fontSize: 11, margin: [0, 0, 0, 10] },
        ],
      },
      {
        text: [
          { text: `${submission.fullName.toUpperCase()}`, bold: true },
          '\n',
          { text: `NATIONAL SERVICE PERSON`, bold: true },
          '\n\n',
          { text: `TEL: ${submission.user.phoneNumber}`, bold: true },
        ],
        fontSize: 11,
        margin: [0, 20, 0, 5],
      },
      {
        text: `APPOINTMENT – NATIONAL SERVICE ${yearRange}`,
        bold: true,
        fontSize: 12,
        alignment: 'left',
        decoration: 'underline',
        margin: [0, 10, 0, 20],
      },
      {
        text: [
          'We are pleased to inform you have been accepted to undertake your National Service at the ',
          { text: `${departmentName} Department, ${submission.divisionPostedTo}`, bold: true },
          ' with effect from ',
          { text: `Friday, November 1, ${currentYear} to Friday, October 31, ${nextYear}`, bold: true },
          '.',
        ],
        fontSize: 11,
        margin: [0, 0, 0, 10],
      },
      {
        text: [
          'You will be subjected to Ghana Cocoa Board and National Service rules and regulations during',
          'your service year.',
        ],
        fontSize: 11,
        margin: [0, 0, 0, 10],
      },
      {
        text: [
          'Ghana Cocoa Board will pay your National Service Allowance of ',
          { text: 'Seven Hundred and Fifteen Ghana Cedis, Fifty-Seven Pesewas (GHc 715.57)', bold: true },
          ' per month.',
        ],
        fontSize: 11,
        margin: [0, 0, 0, 10],
      },
      {
        text: 'You will not be covered by the Board’s Insurance Scheme during the period of your Service with the Board.',
        fontSize: 11,
        margin: [0, 0, 0, 10],
      },
      {
        text: 'We hope you will work diligently and comport yourself during the period for our mutual benefit.',
        fontSize: 11,
        margin: [0, 0, 0, 10],
      },
      {
        text: 'Kindly report with your Bank Account Details either on a bank statement, copy of cheque leaflet or pay-in-slip.',
        fontSize: 11,
        margin: [0, 0, 0, 10],
        bold: true,
      },
      {
        text: [
          'You will be entitled to one (1) month terminal leave in ',
          { text: `October ${nextYear}`, bold: true },
          '.',
        ],
        fontSize: 11,
        margin: [0, 0, 0, 10],
      },
      {
        text: 'Please report to the undersigned for further directives.\nYou can count on our co-operation.',
        fontSize: 11,
        margin: [0, 0, 0, 10],
      },
      {
        image: 'signature',
        width: 120,
        alignment: 'left',
        margin: [0, 0, 0, 5],
      },
      { text: 'PAZ OWUSU BOAKYE (MRS.)', bold: true, fontSize: 11, margin: [0, 0, 0, 5] },
      { text: 'DEPUTY DIRECTOR, HUMAN RESOURCE', fontSize: 11, margin: [0, 0, 0, 10] },
      { text: [
      'FOR: DIRECTOR, HUMAN RESOURCE\n',
      'cc: Director, Human Resource\n',
      'Director, Finance\n',
      `Director, ${submission.user.department?.name || 'Info. Systems'}\n`,
    ],
    fontSize: 11,
    margin: [0, 0, 0, 0],
  },
    ],
    images: {
      ...(letterheadBase64 ? { letterhead: `data:image/png;base64,${letterheadBase64}` } : {}),
      signature: `data:image/png;base64,${signatureBase64}`,
    },
    defaultStyle: {
      font: 'Roboto',
      fontSize: 11,
    },
    pageMargins: [40, 100, 40, 60],
  };
}

export type JobConfirmationLetterTemplateParams = BuildParams;


