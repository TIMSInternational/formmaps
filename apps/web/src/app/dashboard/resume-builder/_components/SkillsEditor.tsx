"use client";

import { motion, AnimatePresence } from "motion/react";
import { ChevronDown, Award, X, Plus } from "lucide-react";

interface Skill {
  id: string;
  name: string;
  category: "technical" | "soft" | "language";
  level: "beginner" | "intermediate" | "advanced" | "expert";
}

export interface SkillsEditorProps {
  expandedSection: string | null;
  toggleSection: (sectionId: string) => void;
  skills: Skill[];
  newSkillName: string;
  setNewSkillName: (name: string) => void;
  addSkill: (skill: Omit<Skill, "id">) => void;
  removeSkill: (id: string) => void;
  setSaveSuccess: (success: boolean) => void;
}

export function SkillsEditor({
  expandedSection,
  toggleSection,
  skills,
  newSkillName,
  setNewSkillName,
  addSkill,
  removeSkill,
  setSaveSuccess,
}: SkillsEditorProps) {
  const handleAddSkill = () => {
    if (newSkillName.trim()) {
      addSkill({
        name: newSkillName.trim(),
        category: "technical",
        level: "intermediate",
      });
      setNewSkillName("");
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
      className={`bg-card rounded-xl border shadow-sm overflow-hidden transition-colors ${
        expandedSection === "skills" ? "border-[#065292]/30" : "border-border"
      }`}
    >
      <button
        onClick={() => toggleSection("skills")}
        className={`w-full flex items-center gap-3 p-4 transition-colors ${
          expandedSection === "skills"
            ? "bg-[#065292]/5"
            : "hover:bg-secondary/50"
        }`}
      >
        <Award className="w-5 h-5 text-[#065292] flex-shrink-0" />
        <span className="font-semibold text-foreground flex-1 text-left">
          Skills
        </span>
        <span className="px-2 py-0.5 text-xs font-semibold bg-[#FFD600] text-[#111111] rounded-full">
          {skills.length} skills
        </span>
        <motion.div
          animate={{
            rotate: expandedSection === "skills" ? 180 : 0,
          }}
          transition={{ duration: 0.2 }}
        >
          <ChevronDown
            className={`w-5 h-5 ${
              expandedSection === "skills"
                ? "text-[#065292]"
                : "text-muted-foreground"
            }`}
          />
        </motion.div>
      </button>

      <AnimatePresence>
        {expandedSection === "skills" && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="border-t border-border overflow-hidden"
          >
            <div className="p-6 space-y-4">
              {/* Skills List */}
              {skills.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-4">
                  {skills.map((skill) => (
                    <div
                      key={skill.id}
                      className="group relative px-3 py-1.5 bg-[#065292]/10 text-[#065292] rounded-full text-sm font-medium border border-[#065292]/20 hover:bg-[#065292]/20 transition-colors"
                    >
                      {skill.name}
                      <button
                        onClick={() => {
                          removeSkill(skill.id);
                          setSaveSuccess(true);
                          setTimeout(() => setSaveSuccess(false), 2000);
                        }}
                        className="absolute -top-1 -right-1 w-5 h-5 bg-red-600 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Add Skill Inline Form */}
              <div className="space-y-3">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newSkillName}
                    onChange={(e) => setNewSkillName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && newSkillName.trim()) {
                        handleAddSkill();
                      }
                    }}
                    placeholder="Type a skill and press Enter"
                    className="flex-1 px-4 py-2 border border-border rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-[#065292] focus:border-[#065292] outline-none transition-all"
                  />
                  <button
                    onClick={handleAddSkill}
                    className="px-4 py-2 bg-[#065292] text-white rounded-lg hover:bg-[#054473] transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Add skills one at a time. Click the X on any skill to
                  remove it.
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
