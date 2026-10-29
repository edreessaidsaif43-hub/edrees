# Chrome Web Store listing

## Name

مساعد تحضير نور

## Short description

Fill Noor lesson preparation forms from locally saved preparation text.

## Detailed description

Noor Lesson Prep Autofill helps teachers enter weekly study plan and lesson preparation details into Noor forms without repeatedly copying and pasting the same text.

The extension provides a simple Arabic popup where the teacher can enter the lesson title, subject, grade, week, learning outcome, concepts, prior learning/warm-up, lesson procedures, formative assessment, summative assessment, and weekly plan notes visible to students and parents. The teacher can also import an `.xlsx` Excel file that contains multiple lesson preparation rows, choose a lesson from the imported list, and send it to the active Noor preparation page with one click.

The extension does not submit the form automatically. Teachers can review all filled fields in Noor before saving.

## Single purpose

Automatically fill lesson preparation fields in Noor using preparation data saved locally by the teacher or imported from a local Excel file.

## Category

Productivity

## Language

Arabic

## Permission justifications

activeTab: Used only when the teacher clicks the extension button to fill the currently open Noor page.

scripting: Used to inject the content script into the active Noor tab when Chrome has not already loaded it.

storage: Used to save lesson preparation text locally in the teacher's browser.

Host permission `https://noor.moe.gov.sa/*`: Required so the extension can detect and fill lesson preparation fields on Noor pages.

Host permission `https://lms.moe.gov.om/*`: Required so the extension can also appear and fill preparation fields on the Ministry of Education LMS pages.

## Privacy disclosure

The extension stores lesson preparation text and imported Excel rows locally in the user's Chrome browser using `chrome.storage.local`.

The extension does not collect, transmit, sell, share, or remotely process user data. No analytics, ads, tracking, or external servers are used.

## Reviewer test instructions

1. Install the extension.
2. Open a Noor lesson preparation form at `https://noor.moe.gov.sa/`.
3. Open the extension popup.
4. Enter sample lesson preparation text.
5. Click `تعبئة صفحة نور`.
6. Confirm that matching fields on the Noor page are filled and highlighted.
