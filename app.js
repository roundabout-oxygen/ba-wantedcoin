const { createApp, ref, computed, watch, onMounted, onUnmounted } = Vue;

createApp({
  setup() {
    const STORAGE_KEY = 'ba_wanted_shop_plan_v7';

    // 現在の年月 (システム現在時刻: 2026年10月)
    const currentYear = 2026;
    const currentMonth = 10;

    // 表示月のオフセット (0: 今月・翌月・翌々月)
    const displayMonthOffset = ref(0);

    // ユーザー設定状態
    const currentCoins = ref(1800);
    const hasMonthly = ref(false);      // マンスリー (+6枚/日)
    const hasMonthlyHalf = ref(false);  // マンスリー（ハーフ） (+3枚/日)
    const hideUnreleased = ref(true);   // 未追加生徒を非表示 (初期チェックON)

    // 表示モード: 'auto' (幅に応じて自動), 'pc' (強制PC表示), 'mobile' (強制スマホ表示)
    const viewMode = ref('auto');
    const windowWidth = ref(window.innerWidth);

    const onResize = () => {
      windowWidth.value = window.innerWidth;
    };

    onMounted(() => {
      window.addEventListener('resize', onResize);
    });

    onUnmounted(() => {
      window.removeEventListener('resize', onResize);
    });

    const isMobileView = computed(() => {
      if (viewMode.value === 'mobile') return true;
      if (viewMode.value === 'pc') return false;
      return windowWidth.value < 768; // 768px未満はスマホ表示
    });

    // ソート・フィルター状態
    const sortKey = ref('releaseDate_asc');
    const filterRole = ref('ALL');
    const filterAttack = ref('ALL');
    const filterStatus = ref('ALL');
    const searchQuery = ref('');

    // 生徒マスター
    const rawMaster = window.STUDENTS_MASTER || [];
    const gradeDefs = window.GRADE_DEFINITIONS || [];

    // 生徒リスト初期化
    // 要件: ハスミ（体操服）はデフォルトで現在・目標とも固有4 (grade: 7)
    // 要件: 初期状態では必要文字数は「-」とし、要文字数・必要コイン数には含めない(isEdited: false)
    const initStudent = (s) => {
      const isHasumiGym = s.name === "ハスミ（体操服）";
      return {
        ...s,
        currentGrade: isHasumiGym ? 7 : 0,    // ハスミ(体操服)は固有4
        currentPieces: 0,
        targetGrade: isHasumiGym ? 7 : 4,     // ハスミ(体操服)は固有4
        buyPlans: {},
        isPinned: false,
        isEdited: false                       // 初期状態は未編集
      };
    };

    const students = ref(rawMaster.map(initStudent));

    // 1日あたりのコイン獲得量
    const dailyCoins = computed(() => {
      let tickets = 6;
      if (hasMonthly.value) tickets += 6;
      if (hasMonthlyHalf.value) tickets += 3;
      return tickets * 10;
    });

    // 30日換算の参考入手量表記
    const monthlyRateText = computed(() => {
      const daily = dailyCoins.value;
      return `1日${daily}ｘ30日＝`;
    });

    const monthlyRateValue = computed(() => {
      return (dailyCoins.value * 30).toLocaleString();
    });

    // 年月文字列ヘルパー
    const toYmKey = (year, month) => {
      return `${year}-${String(month).padStart(2, '0')}`;
    };

    // オフセット付き年月取得ヘルパー
    const getYmByOffset = (offset) => {
      const d = new Date(currentYear, currentMonth - 1 + offset, 1);
      return {
        year: d.getFullYear(),
        month: d.getMonth() + 1,
        key: toYmKey(d.getFullYear(), d.getMonth() + 1),
        days: new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
      };
    };

    // 表示する3ヶ月
    const displayMonths = computed(() => {
      return [
        getYmByOffset(displayMonthOffset.value),
        getYmByOffset(displayMonthOffset.value + 1),
        getYmByOffset(displayMonthOffset.value + 2)
      ];
    });

    // 過去月のデータがあるかどうか
    const hasPastData = computed(() => {
      const currentKey = toYmKey(currentYear, currentMonth);
      return students.value.some(s => {
        if (!s.buyPlans) return false;
        return Object.keys(s.buyPlans).some(k => k < currentKey && (s.buyPlans[k] || 0) > 0);
      });
    });

    // シェイクアニメーション用フラグ
    const isShakingPrev = ref(false);
    const isShakingNext = ref(false);

    const triggerShakePrev = () => {
      isShakingPrev.value = true;
      setTimeout(() => {
        isShakingPrev.value = false;
      }, 450);
    };

    const triggerShakeNext = () => {
      isShakingNext.value = true;
      setTimeout(() => {
        isShakingNext.value = false;
      }, 450);
    };

    // 月ナビゲーション
    // 要件: 今月より前の月のデータがない場合は◀・▶を押しても反応しない (シェイクアニメーション)
    const prevMonth = () => {
      if (!hasPastData.value) {
        triggerShakePrev();
        return;
      }

      // 過去データがある最古の月まで遡れる
      const currentKey = toYmKey(currentYear, currentMonth);
      let oldestOffset = 0;
      students.value.forEach(s => {
        if (s.buyPlans) {
          Object.keys(s.buyPlans).forEach(k => {
            if (k < currentKey && (s.buyPlans[k] || 0) > 0) {
              const [y, m] = k.split('-').map(Number);
              const off = (y - currentYear) * 12 + (m - currentMonth);
              if (off < oldestOffset) oldestOffset = off;
            }
          });
        }
      });

      if (displayMonthOffset.value <= oldestOffset) {
        triggerShakePrev();
        return;
      }

      displayMonthOffset.value -= 1;
    };

    const nextMonth = () => {
      if (!hasPastData.value) {
        triggerShakeNext();
        return;
      }

      // 今月 (offset = 0) より先には進めない
      if (displayMonthOffset.value >= 0) {
        triggerShakeNext();
        return;
      }

      displayMonthOffset.value += 1;
    };

    const resetToCurrentMonth = () => {
      displayMonthOffset.value = 0;
    };

    // ピン留めトグル
    const togglePin = (student) => {
      student.isPinned = !student.isPinned;
    };

    // 純粋な星上げ計算上の必要文字数 (目標 - 現在 - 所持)
    const getRawRequiredPieces = (student) => {
      if (student.currentGrade >= 7) return 0; // 固有4到達済み
      if (student.targetGrade <= student.currentGrade) return 0;

      const targetCum = gradeDefs[student.targetGrade]?.cumPieces || 0;
      const currentCum = gradeDefs[student.currentGrade]?.cumPieces || 0;
      const neededBase = targetCum - currentCum;
      return Math.max(0, neededBase - (student.currentPieces || 0));
    };

    // 集計用必要文字数 (要件: 未追加生徒、および初期状態・未編集の生徒は0として全体集計から除外)
    const getRequiredPieces = (student) => {
      if (student.isUnreleased) return 0; // 未追加生徒はコイン購入対象外のため集計に含めない
      if (!student.isEdited) return 0;
      return getRawRequiredPieces(student);
    };

    // 生徒テーブル・カード用の必要文字数表示 (未追加なら'-', 未編集なら'-', 固有4/満了なら'達成済', その他は数値)
    const getRequiredPiecesDisplay = (student) => {
      if (student.isUnreleased) return '-';
      if (!student.isEdited) return '-';
      if (student.currentGrade >= 7) return '達成済';
      const raw = getRawRequiredPieces(student);
      if (raw <= 0) return '達成済';
      return raw.toLocaleString();
    };

    const isMaxed = (student) => {
      return student.currentGrade >= 7;
    };

    // 指定月までの購入累計と残り文字数計算 (集計用: 未追加生徒・未編集生徒は0)
    const getRemainingAfterMonthIndex = (student, monthIndex) => {
      if (student.isUnreleased) return 0; // 未追加生徒は集計除外
      if (!student.isEdited) return 0;
      const totalNeeded = getRawRequiredPieces(student);
      if (totalNeeded <= 0) return 0;

      let boughtBeforeAndAt = 0;
      for (let i = 0; i <= monthIndex; i++) {
        const ym = displayMonths.value[i].key;
        boughtBeforeAndAt += (student.buyPlans?.[ym] || 0);
      }

      return Math.max(0, totalNeeded - boughtBeforeAndAt);
    };

    // 各月の残り文字数表示 (要件: 未追加なら'(-)', 未編集なら'(残-)', 固有4なら'(-)', 達成なら'(済)', その他は'(残XX)')
    const getRemainingPiecesDisplay = (student, monthIndex) => {
      if (student.isUnreleased) return '(-)';
      if (!student.isEdited) return '(残-)';
      if (isMaxed(student)) return '(-)';
      const rawNeeded = getRawRequiredPieces(student);
      if (rawNeeded <= 0) return '(-)';

      let boughtBeforeAndAt = 0;
      for (let i = 0; i <= monthIndex; i++) {
        const ym = displayMonths.value[i].key;
        boughtBeforeAndAt += (student.buyPlans?.[ym] || 0);
      }
      const rem = Math.max(0, rawNeeded - boughtBeforeAndAt);
      if (rem <= 0) return '(済)';
      return `(残${rem})`;
    };

    // 購入可能判定 (未追加生徒は常に購入不可)
    const canBuyMoreInMonth = (student, monthIndex) => {
      if (student.isUnreleased) return false;
      if (isMaxed(student)) return false;

      const totalNeeded = getRawRequiredPieces(student);
      if (totalNeeded <= 0) return false;

      let boughtBefore = 0;
      for (let i = 0; i < monthIndex; i++) {
        const ym = displayMonths.value[i].key;
        boughtBefore += (student.buyPlans?.[ym] || 0);
      }
      const remBefore = Math.max(0, totalNeeded - boughtBefore);
      if (remBefore <= 0) return false;

      const currentYm = displayMonths.value[monthIndex].key;
      const currentBuy = student.buyPlans?.[currentYm] || 0;

      if (currentBuy >= 80) return false;
      if (currentBuy >= remBefore) return false;

      return true;
    };

    // 購入数増減 (未追加生徒は編集不可)
    const increaseBuy = (student, monthIndex) => {
      if (student.isUnreleased) return;
      student.isEdited = true;
      const ym = displayMonths.value[monthIndex].key;
      if (!student.buyPlans) student.buyPlans = {};
      const current = student.buyPlans[ym] || 0;

      if (current < 80 && canBuyMoreInMonth(student, monthIndex)) {
        student.buyPlans[ym] = Math.min(80, current + 5);
      }
    };

    const decreaseBuy = (student, monthIndex) => {
      if (student.isUnreleased) return;
      student.isEdited = true;
      const ym = displayMonths.value[monthIndex].key;
      if (!student.buyPlans) student.buyPlans = {};
      const current = student.buyPlans[ym] || 0;

      if (current > 0) {
        student.buyPlans[ym] = Math.max(0, current - 5);
      }
    };

    const getBuyCount = (student, monthIndex) => {
      if (student.isUnreleased) return 0;
      const ym = displayMonths.value[monthIndex].key;
      return student.buyPlans?.[ym] || 0;
    };

    // シークバー・所持数変更時 (isEdited = true にする)
    const onCurrentGradeChange = (student) => {
      student.isEdited = true;
      if (student.currentGrade > student.targetGrade) {
        student.targetGrade = student.currentGrade;
      }
    };

    const onTargetGradeChange = (student) => {
      student.isEdited = true;
      if (student.targetGrade < student.currentGrade) {
        student.currentGrade = student.targetGrade;
      }
    };

    const onCurrentPiecesChange = (student) => {
      student.isEdited = true;
      if (student.currentPieces == null || student.currentPieces < 0) {
        student.currentPieces = 0;
      }
    };

    const onStudentEdit = (student) => {
      student.isEdited = true;
    };

    // 【要件追加】：必要文字数の全生徒合計 ＆ 購入に必要なコイン数(文字数x10)
    const totalRequiredPieces = computed(() => {
      return students.value.reduce((sum, s) => sum + getRequiredPieces(s), 0);
    });

    const totalRequiredCoins = computed(() => {
      return totalRequiredPieces.value * 10;
    });

    // 3ヶ月収支集計 ＆ 各月の必要コイン残
    const monthsSummary = computed(() => {
      const list = [];
      let prevBalance = currentCoins.value || 0;

      displayMonths.value.forEach((mInfo, idx) => {
        const ym = mInfo.key;
        const income = dailyCoins.value * mInfo.days;

        const totalPieces = students.value.reduce((sum, s) => {
          if (s.isUnreleased) return sum;
          return sum + (s.buyPlans?.[ym] || 0);
        }, 0);

        const expense = totalPieces * 10;
        const net = income - expense;
        const balance = prevBalance + net;

        // 【要件追加】：その月終了後の全生徒の「必要コインの残」 (残り文字数 x 10)
        const remainingNeededPieces = students.value.reduce((sum, s) => {
          return sum + getRemainingAfterMonthIndex(s, idx);
        }, 0);
        const remainingNeededCoins = remainingNeededPieces * 10;

        list.push({
          ...mInfo,
          displayIndex: idx,
          label: idx === 0 && displayMonthOffset.value === 0 ? '今月' :
                 idx === 1 && displayMonthOffset.value === 0 ? '翌月' :
                 idx === 2 && displayMonthOffset.value === 0 ? '翌々月' :
                 `${mInfo.month}月`,
          income,
          expense,
          totalPieces,
          net,
          balance,
          remainingNeededCoins
        });

        prevBalance = balance;
      });

      return list;
    });

    const unreleasedCount = computed(() => {
      return students.value.filter(s => s.isUnreleased).length;
    });

    // 表記ヘルパー (☆1〜4, 固有1〜4)
    const getCompactGradeText = (gradeIndex) => {
      if (gradeIndex <= 3) {
        return `☆${gradeIndex + 1}`;
      } else {
        return `固有${gradeIndex - 3}`;
      }
    };

    const formatNumber = (num) => {
      return (num || 0).toLocaleString();
    };

    const formattedCurrentCoins = computed({
      get() {
        return (currentCoins.value || 0).toLocaleString();
      },
      set(val) {
        const cleaned = String(val).replace(/[^0-9]/g, '');
        currentCoins.value = cleaned ? parseInt(cleaned, 10) : 0;
      }
    });

    const onImageError = (event, student) => {
      if (student.wikiIcon && event.target.src !== student.wikiIcon) {
        event.target.src = student.wikiIcon;
      }
    };

    // フィルタリング＆ソート
    const filteredStudents = computed(() => {
      let list = [...students.value];

      if (hideUnreleased.value) {
        list = list.filter(s => !s.isUnreleased);
      }

      if (filterRole.value !== 'ALL') {
        list = list.filter(s => s.role === filterRole.value);
      }

      if (filterAttack.value !== 'ALL') {
        list = list.filter(s => s.attack === filterAttack.value);
      }

      if (filterStatus.value === 'UNFINISHED') {
        list = list.filter(s => getRequiredPieces(s) > 0);
      } else if (filterStatus.value === 'HAS_BUY') {
        const ym0 = displayMonths.value[0].key;
        list = list.filter(s => (s.buyPlans?.[ym0] || 0) > 0);
      }

      if (searchQuery.value.trim()) {
        const q = searchQuery.value.trim().toLowerCase();
        list = list.filter(s =>
          s.name.toLowerCase().includes(q) ||
          s.event.toLowerCase().includes(q) ||
          s.class.toLowerCase().includes(q)
        );
      }

      const ym0 = displayMonths.value[0].key;
      list.sort((a, b) => {
        if (a.isPinned !== b.isPinned) {
          return a.isPinned ? -1 : 1;
        }

        switch (sortKey.value) {
          case 'releaseDate_asc':
            return a.releaseDate.localeCompare(b.releaseDate);
          case 'releaseDate_desc':
            return b.releaseDate.localeCompare(a.releaseDate);
          case 'name_asc':
            return a.name.localeCompare(b.name, 'ja');
          case 'needed_desc':
            return getRequiredPieces(b) - getRequiredPieces(a);
          case 'needed_asc':
            return getRequiredPieces(a) - getRequiredPieces(b);
          case 'buyM1_desc':
            return (b.buyPlans?.[ym0] || 0) - (a.buyPlans?.[ym0] || 0);
          default:
            return a.id - b.id;
        }
      });

      return list;
    });

    const setAllTarget = (gradeIndex) => {
      students.value.forEach(s => {
        s.targetGrade = Math.max(s.currentGrade, gradeIndex);
        s.isEdited = true;
      });
    };

    const clearCurrentMonthBuys = () => {
      const ym0 = displayMonths.value[0].key;
      students.value.forEach(s => {
        if (s.buyPlans) {
          s.buyPlans[ym0] = 0;
        }
      });
    };

    const confirmReset = () => {
      if (confirm('すべての入力（所持コイン、星上げ目標、購入計画、ピン留め）を初期化しますか？')) {
        localStorage.removeItem(STORAGE_KEY);
        currentCoins.value = 1800;
        hasMonthly.value = false;
        hasMonthlyHalf.value = false;
        hideUnreleased.value = true;
        sortKey.value = 'releaseDate_asc';
        filterRole.value = 'ALL';
        filterAttack.value = 'ALL';
        filterStatus.value = 'ALL';
        searchQuery.value = '';
        displayMonthOffset.value = 0;

        students.value = rawMaster.map(initStudent);
      }
    };

    const exportData = () => {
      const data = {
        version: 8,
        exportedAt: new Date().toISOString(),
        currentCoins: currentCoins.value,
        hasMonthly: hasMonthly.value,
        hasMonthlyHalf: hasMonthlyHalf.value,
        hideUnreleased: hideUnreleased.value,
        students: students.value.map(s => ({
          id: s.id,
          name: s.name,
          currentGrade: s.currentGrade,
          currentPieces: s.currentPieces,
          targetGrade: s.targetGrade,
          buyPlans: s.buyPlans || {},
          isPinned: !!s.isPinned,
          isEdited: !!s.isEdited
        }))
      };

      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ブルアカ指名手配ショップ計画_${new Date().toISOString().slice(0,10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    };

    const importData = (event) => {
      const file = event.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const imported = JSON.parse(e.target.result);
          if (imported.currentCoins !== undefined) currentCoins.value = imported.currentCoins;
          if (imported.hasMonthly !== undefined) hasMonthly.value = imported.hasMonthly;
          if (imported.hasMonthlyHalf !== undefined) hasMonthlyHalf.value = imported.hasMonthlyHalf;
          if (imported.hideUnreleased !== undefined) hideUnreleased.value = imported.hideUnreleased;

          if (Array.isArray(imported.students)) {
            imported.students.forEach(imp => {
              const target = students.value.find(s => s.id === imp.id || s.name === imp.name);
              if (target) {
                if (imp.currentGrade !== undefined) target.currentGrade = imp.currentGrade;
                if (imp.currentPieces !== undefined) target.currentPieces = imp.currentPieces;
                if (imp.targetGrade !== undefined) target.targetGrade = imp.targetGrade;
                if (imp.buyPlans) target.buyPlans = imp.buyPlans;
                if (imp.isPinned !== undefined) target.isPinned = imp.isPinned;
                if (imp.isEdited !== undefined) target.isEdited = imp.isEdited;
              }
            });
          }
          alert('設定データを正常に読み込みました！');
        } catch (err) {
          alert('ファイルの読み込みに失敗しました。正しいJSONファイルかご確認ください。');
        }
      };
      reader.readAsText(file);
      event.target.value = '';
    };

    const saveState = () => {
      const payload = {
        currentCoins: currentCoins.value,
        hasMonthly: hasMonthly.value,
        hasMonthlyHalf: hasMonthlyHalf.value,
        hideUnreleased: hideUnreleased.value,
        sortKey: sortKey.value,
        filterRole: filterRole.value,
        filterAttack: filterAttack.value,
        viewMode: viewMode.value,
        students: students.value.map(s => ({
          id: s.id,
          currentGrade: s.currentGrade,
          currentPieces: s.currentPieces,
          targetGrade: s.targetGrade,
          buyPlans: s.buyPlans || {},
          isPinned: !!s.isPinned,
          isEdited: !!s.isEdited
        }))
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    };

    const loadState = () => {
      try {
        let raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) {
          raw = localStorage.getItem('ba_wanted_shop_plan_v7') || localStorage.getItem('ba_wanted_shop_plan_v6');
        }
        if (!raw) {
          // 初回ロード時もハスミ(体操服)は固有4
          const hasumi = students.value.find(s => s.name === "ハスミ（体操服）");
          if (hasumi) {
            hasumi.currentGrade = 7;
            hasumi.targetGrade = 7;
          }
          return;
        }

        const parsed = JSON.parse(raw);
        if (parsed.currentCoins !== undefined) currentCoins.value = parsed.currentCoins;
        if (parsed.hasMonthly !== undefined) hasMonthly.value = parsed.hasMonthly;
        if (parsed.hasMonthlyHalf !== undefined) hasMonthlyHalf.value = parsed.hasMonthlyHalf;
        if (parsed.hideUnreleased !== undefined) hideUnreleased.value = parsed.hideUnreleased;
        if (parsed.sortKey) sortKey.value = parsed.sortKey;
        if (parsed.filterRole) filterRole.value = parsed.filterRole;
        if (parsed.filterAttack) filterAttack.value = parsed.filterAttack;
        if (parsed.viewMode) viewMode.value = parsed.viewMode;

        if (Array.isArray(parsed.students)) {
          parsed.students.forEach(saved => {
            const target = students.value.find(s => s.id === saved.id);
            if (target) {
              if (saved.currentGrade !== undefined) target.currentGrade = saved.currentGrade;
              if (saved.currentPieces !== undefined) target.currentPieces = saved.currentPieces;
              if (saved.targetGrade !== undefined) target.targetGrade = saved.targetGrade;
              if (saved.buyPlans) target.buyPlans = saved.buyPlans;
              if (saved.isPinned !== undefined) target.isPinned = saved.isPinned;

              // 未追加生徒はショップ購入不可のためbuyPlansを空にする
              if (target.isUnreleased) {
                target.buyPlans = {};
              }

              // 旧データでハスミ(体操服)が初期デフォルト(星1→固有1)のままであれば固有4に自動補正
              if (target.name === "ハスミ（体操服）" && target.currentGrade === 0 && target.targetGrade === 4) {
                target.currentGrade = 7;
                target.targetGrade = 7;
              }

              if (saved.isEdited !== undefined) {
                target.isEdited = saved.isEdited;
              } else {
                // 旧保存データ向け：変更があれば編集済み、初期値のままなら未編集
                const hasBuys = saved.buyPlans && Object.values(saved.buyPlans).some(v => v > 0);
                const isDefaultGrade = target.name === "ハスミ（体操服）"
                  ? (target.currentGrade === 7 && target.targetGrade === 7)
                  : (target.currentGrade === 0 && target.targetGrade === 4);
                target.isEdited = !isDefaultGrade || ((target.currentPieces || 0) > 0) || hasBuys;
              }
            }
          });
        }
      } catch (e) {
        console.error('Failed to load state from localStorage', e);
      }
    };

    onMounted(() => {
      loadState();
    });

    watch(
      [currentCoins, hasMonthly, hasMonthlyHalf, hideUnreleased, sortKey, filterRole, filterAttack, viewMode, students],
      () => {
        saveState();
      },
      { deep: true }
    );

    return {
      currentCoins,
      formattedCurrentCoins,
      hasMonthly,
      hasMonthlyHalf,
      displayMonthOffset,
      displayMonths,
      hasPastData,
      isShakingPrev,
      isShakingNext,
      prevMonth,
      nextMonth,
      resetToCurrentMonth,
      togglePin,
      viewMode,
      isMobileView,
      hideUnreleased,
      sortKey,
      filterRole,
      filterAttack,
      filterStatus,
      searchQuery,
      students,
      dailyCoins,
      monthlyRateText,
      monthlyRateValue,
      totalRequiredPieces,
      totalRequiredCoins,
      monthsSummary,
      unreleasedCount,
      getRawRequiredPieces,
      getRequiredPieces,
      getRequiredPiecesDisplay,
      getRemainingPiecesDisplay,
      isMaxed,
      getRemainingAfterMonthIndex,
      canBuyMoreInMonth,
      increaseBuy,
      decreaseBuy,
      getBuyCount,
      onCurrentGradeChange,
      onTargetGradeChange,
      onCurrentPiecesChange,
      onStudentEdit,
      onImageError,
      getCompactGradeText,
      formatNumber,
      filteredStudents,
      setAllTarget,
      clearCurrentMonthBuys,
      confirmReset,
      exportData,
      importData
    };
  }
}).mount('#app');
