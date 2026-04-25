"use client";
import { useGlobalStore } from "@/store/useGlobalStore";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { motion } from "motion/react";
import { Sparkles, Linkedin } from "lucide-react";
import { careerFields } from "./resumeData";

export function PersonalInfoStep() {
  const { resumeBuilder, updatePersonalInfo, populateWithDummyContent } =
    useGlobalStore();
  const { personalInfo, careerField } = resumeBuilder.data;

  const handleInputChange = (field: string, value: string) => {
    updatePersonalInfo({ [field]: value });
  };

  const handlePopulateWithSample = () => {
    if (careerField) {
      populateWithDummyContent(careerField);
    }
  };

  const selectedCareerField = careerFields.find((f) => f.id === careerField);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">
            Personal Information
          </h2>
          <p className="text-sm text-gray-600">
            Start with your basic contact information and a professional
            summary.
          </p>
        </div>

        {/* Fill with Sample Data Button */}
        <Button
          onClick={handlePopulateWithSample}
          variant="outline"
          className="flex items-center gap-2 text-sm"
          disabled={!careerField}
        >
          <Sparkles size={16} />
          Fill with Sample Data
        </Button>
        {/* LinkedIn import removed in this flow — handled by other integration */}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="fullName">Full Name *</Label>
          <Input
            id="fullName"
            value={personalInfo.fullName}
            onChange={(e) => handleInputChange("fullName", e.target.value)}
            placeholder="John Doe"
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="email">Email Address *</Label>
          <Input
            id="email"
            type="email"
            value={personalInfo.email}
            onChange={(e) => handleInputChange("email", e.target.value)}
            placeholder="john.doe@email.com"
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="phone">Phone Number</Label>
          <Input
            id="phone"
            type="tel"
            value={personalInfo.phone}
            onChange={(e) => handleInputChange("phone", e.target.value)}
            placeholder="+1 (555) 123-4567"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="location">Location</Label>
          <Input
            id="location"
            value={personalInfo.location}
            onChange={(e) => handleInputChange("location", e.target.value)}
            placeholder="City, State"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="linkedin">LinkedIn Profile</Label>
          <Input
            id="linkedin"
            value={personalInfo.linkedin}
            onChange={(e) => handleInputChange("linkedin", e.target.value)}
            placeholder="linkedin.com/in/johndoe"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="website">Website/Portfolio</Label>
          <Input
            id="website"
            value={personalInfo.website}
            onChange={(e) => handleInputChange("website", e.target.value)}
            placeholder="www.johndoe.com"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="summary">Professional Summary (Optional)</Label>
        <textarea
          id="summary"
          value={personalInfo.summary}
          onChange={(e) => handleInputChange("summary", e.target.value)}
          placeholder="A brief 2-3 sentence overview highlighting your key skills, education, and career goals. For freshers: mention your degree, relevant skills, and what type of role you're seeking..."
          rows={4}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
        />
        <div className="text-xs text-gray-500 space-y-1">
          <p>
            <strong>Tip:</strong> Keep it concise and highlight your most
            relevant skills.
          </p>
          <p>
            <strong>For freshers:</strong> Focus on your education, skills,
            projects, and career aspirations rather than work experience.
          </p>
        </div>
      </div>

      {/* Sample Content Option */}
      {/* {careerField && selectedCareerField && (
        <motion.div
          className="mt-8 p-6 bg-gradient-to-r from-indigo-50 to-purple-50 rounded-xl border border-indigo-200"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Sparkles className="w-6 h-6 text-indigo-600" />
              <div>
                <h3 className="text-lg font-semibold text-indigo-900">Get Started Quickly</h3>
                <p className="text-sm text-indigo-700">
                  Fill your resume with realistic sample content for {selectedCareerField.name}
                </p>
              </div>
            </div>
            <Button
              onClick={handlePopulateWithSample}
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2 rounded-lg font-medium transition-colors"
            >
              <Sparkles className="w-4 h-4 mr-2" />
              Fill with Sample Content
            </Button>
          </div>
          <div className="mt-4 text-xs text-indigo-600">
            <p><strong>Note:</strong> This will populate all sections with sample data appropriate for your career field. You can edit or replace any content afterward.</p>
          </div>
        </motion.div>
      )} */}
    </motion.div>
  );
}
