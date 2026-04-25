"use client";

import { useState, useEffect } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Loader2, Upload, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

export function ProfileSettingsTab() {
  const { t } = useTranslation();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [profile, setProfile] = useState({
    name: "",
    title: "",
    bio: "",
    specialization: "",
    location: "",
    languages: [] as string[],
    tags: [] as string[],
    image: "",
  });
  const [newLanguage, setNewLanguage] = useState("");
  const [newTag, setNewTag] = useState("");

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      const { updateCoachProfile } = await import("@/services/coachService");
      // TODO: Replace with actual GET endpoint
      // const data = await getCoachProfile();
      // setProfile(data);
      setIsLoading(false);
    } catch (error) {
      toast.error(t("coaching.profile.failedToLoad"));
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const { updateCoachProfile } = await import("@/services/coachService");
      await updateCoachProfile(profile);
      toast.success(t("coaching.profile.updated"));
    } catch (error) {
      toast.error(t("coaching.profile.failedToUpdate"));
    } finally {
      setIsSaving(false);
    }
  };

  const addLanguage = () => {
    if (newLanguage && !profile.languages.includes(newLanguage)) {
      setProfile({
        ...profile,
        languages: [...profile.languages, newLanguage],
      });
      setNewLanguage("");
    }
  };

  const removeLanguage = (lang: string) => {
    setProfile({
      ...profile,
      languages: profile.languages.filter((l) => l !== lang),
    });
  };

  const addTag = () => {
    if (newTag && !profile.tags.includes(newTag)) {
      setProfile({ ...profile, tags: [...profile.tags, newTag] });
      setNewTag("");
    }
  };

  const removeTag = (tag: string) => {
    setProfile({ ...profile, tags: profile.tags.filter((t) => t !== tag) });
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profile Information</CardTitle>
        <CardDescription>
          Update your public coaching profile visible to students.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Profile Image */}
        <div className="space-y-2">
          <Label>Profile Image</Label>
          <div className="flex items-center gap-4">
            {profile.image ? (
              <img
                src={profile.image}
                alt="Profile"
                className="h-20 w-20 rounded-full object-cover"
              />
            ) : (
              <div className="h-20 w-20 rounded-full bg-muted flex items-center justify-center">
                <Upload className="h-8 w-8 text-muted-foreground" />
              </div>
            )}
            <Button variant="outline" size="sm">
              <Upload className="mr-2 h-4 w-4" />
              Upload Image
            </Button>
          </div>
        </div>

        {/* Name */}
        <div className="space-y-2">
          <Label htmlFor="name">Full Name</Label>
          <Input
            id="name"
            value={profile.name}
            onChange={(e) => setProfile({ ...profile, name: e.target.value })}
            placeholder="Sarah Wilson"
          />
        </div>

        {/* Title */}
        <div className="space-y-2">
          <Label htmlFor="title">Professional Title</Label>
          <Input
            id="title"
            value={profile.title}
            onChange={(e) => setProfile({ ...profile, title: e.target.value })}
            placeholder="Senior Career Coach"
          />
        </div>

        {/* Bio */}
        <div className="space-y-2">
          <Label htmlFor="bio">Bio</Label>
          <Textarea
            id="bio"
            value={profile.bio}
            onChange={(e) => setProfile({ ...profile, bio: e.target.value })}
            placeholder="Tell students about your coaching experience..."
            rows={5}
          />
          <p className="text-sm text-muted-foreground">
            {profile.bio.length} / 500 characters
          </p>
        </div>

        {/* Specialization */}
        <div className="space-y-2">
          <Label htmlFor="specialization">Specialization</Label>
          <Input
            id="specialization"
            value={profile.specialization}
            onChange={(e) =>
              setProfile({ ...profile, specialization: e.target.value })
            }
            placeholder="Tech Leadership"
          />
        </div>

        {/* Location */}
        <div className="space-y-2">
          <Label htmlFor="location">Location</Label>
          <Input
            id="location"
            value={profile.location}
            onChange={(e) =>
              setProfile({ ...profile, location: e.target.value })
            }
            placeholder="San Francisco, CA"
          />
        </div>

        {/* Languages */}
        <div className="space-y-2">
          <Label>Languages</Label>
          <div className="flex gap-2">
            <Input
              value={newLanguage}
              onChange={(e) => setNewLanguage(e.target.value)}
              onKeyPress={(e) => e.key === "Enter" && addLanguage()}
              placeholder="Add a language"
            />
            <Button type="button" onClick={addLanguage} variant="outline">
              Add
            </Button>
          </div>
          <div className="flex flex-wrap gap-2 mt-2">
            {profile.languages.map((lang) => (
              <Badge key={lang} variant="secondary" className="gap-1">
                {lang}
                <X
                  className="h-3 w-3 cursor-pointer"
                  onClick={() => removeLanguage(lang)}
                />
              </Badge>
            ))}
          </div>
        </div>

        {/* Tags */}
        <div className="space-y-2">
          <Label>Expertise Tags</Label>
          <div className="flex gap-2">
            <Input
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              onKeyPress={(e) => e.key === "Enter" && addTag()}
              placeholder="Add a tag"
            />
            <Button type="button" onClick={addTag} variant="outline">
              Add
            </Button>
          </div>
          <div className="flex flex-wrap gap-2 mt-2">
            {profile.tags.map((tag) => (
              <Badge key={tag} variant="secondary" className="gap-1">
                {tag}
                <X
                  className="h-3 w-3 cursor-pointer"
                  onClick={() => removeTag(tag)}
                />
              </Badge>
            ))}
          </div>
        </div>

        {/* Save Button */}
        <div className="flex justify-end pt-4">
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              "Save Changes"
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
