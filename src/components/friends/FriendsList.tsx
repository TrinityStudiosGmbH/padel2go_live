import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Users, MoreHorizontal, UserMinus, Trophy, TrendingUp, MessageCircle } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useFriendships, Friend } from "@/hooks/useFriendships";
import { FriendProfileCard } from "./FriendProfileCard";
import { formatDistanceToNow } from "date-fns";
import { de, enUS } from "date-fns/locale";
import { cn } from "@/lib/utils";

function FriendCard({ friend, onOpenProfile }: { friend: Friend; onOpenProfile: (username: string) => void }) {
  const { t, i18n } = useTranslation("social");
  const dateLocale = i18n.language === "en" ? enUS : de;
  const { removeFriend, isRemovingFriend } = useFriendships();
  const navigate = useNavigate();

  const initials = friend.displayName
    ?.split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase() || friend.username?.[0]?.toUpperCase() || "?";

  const handleCardClick = () => {
    if (friend.username) {
      onOpenProfile(friend.username);
    }
  };

  return (
    <div 
      className={cn(
        "flex items-center gap-4 p-4 rounded-xl border-2 bg-card transition-all duration-200",
        "hover:shadow-lg hover:scale-[1.01] cursor-pointer",
        "border-border/50"
      )}
    >
      {/* Avatar */}
      <button 
        onClick={handleCardClick} 
        className="focus:outline-none focus:ring-2 focus:ring-primary/50 rounded-full"
      >
        <Avatar 
          className="w-12 h-12 ring-2 ring-primary/30 cursor-pointer transition-all hover:ring-4"
        >
          <AvatarImage src={friend.avatarUrl || undefined} alt={friend.displayName || friend.username || t("common.userAlt")} />
          <AvatarFallback className="bg-muted text-foreground font-semibold">
            {initials}
          </AvatarFallback>
        </Avatar>
      </button>

      {/* Info - Clickable */}
      <button onClick={handleCardClick} className="flex-1 min-w-0 text-left focus:outline-none group">
        <div className="flex items-center gap-2">
          <h3 className="font-medium text-foreground truncate group-hover:text-primary transition-colors">
            {friend.displayName || friend.username || t("common.unknown")}
          </h3>
          <Badge
            variant="outline"
            className="h-5 shrink-0 border-primary/30 px-1.5 py-0 text-xs text-primary"
          >
            {friend.playCredits.toLocaleString("de-DE")} P
          </Badge>
        </div>
        {friend.username && friend.displayName && (
          <p className="text-xs text-muted-foreground">@{friend.username}</p>
        )}
        <p className="text-xs text-muted-foreground/70 mt-0.5">
          {t("friendsList.friendsSince", { time: formatDistanceToNow(new Date(friend.friendsSince), { locale: dateLocale }) })}
        </p>
      </button>

      {/* Stats - Skill Level + W/L compact */}
      <div className="hidden sm:flex flex-col items-end gap-1.5">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">{t("friendsList.skill")}</span>
          <span className="text-sm font-bold text-primary">{friend.skillLevel.toFixed(1)}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{t("friendsList.credits", { credits: friend.playCredits.toLocaleString() })}</span>
        </div>
      </div>

      {/* Actions - Stop propagation to prevent card click */}
      <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
        <Button
          variant="ghost"
          size="icon"
          className="shrink-0 hover:bg-primary/10 hover:text-primary"
          onClick={() => navigate(`/dashboard/chat?with=${friend.id}`)}
          aria-label={t("friendsList.chatAria")}
        >
          <MessageCircle className="w-4 h-4" />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="shrink-0">
              <MoreHorizontal className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              className="text-destructive"
              onClick={() => removeFriend(friend.friendshipId)}
              disabled={isRemovingFriend}
            >
              <UserMinus className="w-4 h-4 mr-2" />
              {t("friendsList.removeFriend")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

export function FriendsList() {
  const { t } = useTranslation("social");
  const { friends, isLoadingFriends } = useFriendships();
  const [selectedFriendUsername, setSelectedFriendUsername] = useState<string | null>(null);

  // Additional frontend deduplication as safety net
  const uniqueFriends = friends.filter((friend, index, self) =>
    index === self.findIndex(f => f.id === friend.id)
  );

  const handleOpenProfile = (username: string) => {
    setSelectedFriendUsername(username);
  };

  const handleCloseProfile = () => {
    setSelectedFriendUsername(null);
  };

  if (isLoadingFriends) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="p-4 rounded-xl border border-border/50 animate-pulse">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-muted" />
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-muted rounded w-32" />
                <div className="h-3 bg-muted rounded w-24" />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (uniqueFriends.length === 0) {
    return (
      <div className="text-center py-16">
        <div className="w-20 h-20 rounded-full bg-muted/50 flex items-center justify-center mx-auto mb-4">
          <Users className="w-10 h-10 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-medium text-foreground mb-2">{t("friendsList.emptyTitle")}</h3>
        <p className="text-sm text-muted-foreground max-w-sm mx-auto">
          {t("friendsList.emptyText")}
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-3">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-medium text-muted-foreground">
            {t(uniqueFriends.length === 1 ? "friendsList.countSingular" : "friendsList.countPlural", { count: uniqueFriends.length })}
          </h2>
        </div>
        {uniqueFriends.map((friend) => (
          <FriendCard 
            key={friend.id} 
            friend={friend} 
            onOpenProfile={handleOpenProfile}
          />
        ))}
      </div>

      {/* Friend Profile Card Drawer */}
      <FriendProfileCard
        username={selectedFriendUsername || ""}
        isOpen={!!selectedFriendUsername}
        onClose={handleCloseProfile}
      />
    </>
  );
}
