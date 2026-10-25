'use strict';

const { validateLesson } = require('../tutor-website/validate.js');
const { schemaErrors } = require('../tutor-website/schema.js');

module.exports = { validateLesson: lesson => validateLesson('history', lesson), schemaErrors };
